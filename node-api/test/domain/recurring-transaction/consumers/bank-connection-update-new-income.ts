import * as sinon from 'sinon';
import { expect } from 'chai';
import { constant, pick } from 'lodash';
import { RetriableError } from '@dave-inc/pubsub';
import { BankAccountType } from '@dave-inc/wire-typings';
import { BankAccount } from '../../../../src/models';
import factory from '../../../factories';
import { clean } from '../../../test-helpers';
import {
  connectionUpdatedDetectIncome,
  getAccountsWithoutIncome,
  isRateLimited,
  onProcessData,
  setMainPaychecks,
} from '../../../../src/domain/recurring-transaction/consumers/bank-connection-update-new-income';
import { RateLimiter } from '../../../../src/lib/rate-limiter';
import * as DetectRecurringIncome from '../../../../src/domain/recurring-transaction/detect-recurring-transaction';
import Notifications from '../../../../src/domain/recurring-transaction/notifications';
import * as Store from '../../../../src/domain/recurring-transaction/store';
import { ModificationSource } from '../../../../src/domain/recurring-transaction/types';
import {
  BankConnectionUpdateType,
  IBankConnectionUpdateCompletedEventData,
} from '../../../../src/typings';
import * as IncomeTransitionExperiment from '../../../../src/domain/recurring-transaction/experiments/detect-transitioned-income';
import * as ReadReplica from '../../../../src/helper/read-replica';
import { forceExperimentBucketing } from '@dave-inc/experiment';

describe('bank-connection-update-new-income consumer', () => {
  const sandbox = sinon.createSandbox();

  let notificationStub: sinon.SinonStub;
  let transitionIncomeStub: sinon.SinonStub;
  let useReplicaStub: sinon.SinonStub;
  let detectionStatusStub: sinon.SinonStub;

  beforeEach(async () => {
    await clean(sandbox);
    notificationStub = sandbox.stub(Notifications, 'notifyNewIncome');
    sandbox.stub(Store, 'getByUser').returns([]);
    forceExperimentBucketing(sandbox, {
      [IncomeTransitionExperiment.TRANSITION_INCOME_EXPERIMENT]: true,
    });
    transitionIncomeStub = sandbox
      .stub(IncomeTransitionExperiment, 'runTransitionIncomeExperiment')
      .callThrough();
    sandbox.stub(ReadReplica, 'getReadReplicaLag').resolves();
    useReplicaStub = sandbox.stub(ReadReplica, 'shouldUseReadReplica').resolves();
    detectionStatusStub = sandbox
      .stub(DetectRecurringIncome, 'markInitialIncomeDetectionComplete')
      .resolves();
  });

  after(async () => sandbox.restore());

  describe('check account income status', async () => {
    afterEach(() => sandbox.restore());

    it('should detect accounts that needs detection run', async () => {
      sandbox
        .stub(BankAccount, 'getSupportedAccountsByBankConnectionId')
        .resolves([{ id: 100 }, { id: 101 }]);
      sandbox.stub(Store, 'getByBankAccount').callsFake(async accountId => {
        if (accountId === 100) {
          return [{ transactionDisplayName: 'some-valid-income' }];
        } else {
          return [];
        }
      });

      const bankAccountIds = await getAccountsWithoutIncome(1);
      expect(bankAccountIds.length).to.equal(1);
      expect(bankAccountIds[0]).to.equal(101);
    });
  });

  function makeBankConnectionUpdatedEventData(
    accounts: BankAccount[],
    updateType: BankConnectionUpdateType = BankConnectionUpdateType.DEFAULT_UPDATE,
  ): IBankConnectionUpdateCompletedEventData {
    const [account0] = accounts;
    return {
      userId: account0.userId,
      bankConnectionId: account0.bankConnectionId,
      bankAccountIds: accounts.map(account => account.id),
      updateType,
      connection: null,
      bankAccounts: [],
      options: null,
    };
  }

  function matchAccount(id: number): sinon.SinonMatcher {
    return sinon.match((account: BankAccount) => account.id === id);
  }

  describe('trigger new income detection', async () => {
    beforeEach(() => sandbox.stub(RateLimiter.prototype, 'isRateLimited').resolves(false));

    after(() => clean(sandbox));

    async function testTriggerDetection(updateType: BankConnectionUpdateType) {
      const account = await factory.create('checking-account');
      const data = makeBankConnectionUpdatedEventData([account], updateType);
      const detectStub = sandbox
        .stub(DetectRecurringIncome, 'addUndetectedRecurringTransaction')
        .resolves([]);
      await connectionUpdatedDetectIncome(data.userId, data.bankConnectionId, data.bankAccountIds);

      sandbox.assert.calledOnce(detectStub);
      sandbox.assert.calledWith(detectStub, data.userId, matchAccount(account.id));
    }

    it('should trigger income detection on default update', async () => {
      await testTriggerDetection(BankConnectionUpdateType.DEFAULT_UPDATE);
    });

    it('should trigger income detection on inital update', async () => {
      await testTriggerDetection(BankConnectionUpdateType.INITIAL_UPDATE);
    });

    it('should trigger income detection on historical update', async () => {
      await testTriggerDetection(BankConnectionUpdateType.HISTORICAL_UPDATE);
    });

    it('should trigger income detection on all provided bank accounts', async () => {
      const account0 = await factory.create('checking-account');
      const bankConnectionInfo = pick(account0, ['userId', 'bankConnectionId']);
      const account1 = await factory.create('checking-account', bankConnectionInfo);
      const account2 = await factory.create('checking-account', bankConnectionInfo);
      const accounts = [account0, account1, account2];

      const data = makeBankConnectionUpdatedEventData(accounts);

      const detectStub = sandbox
        .stub(DetectRecurringIncome, 'addUndetectedRecurringTransaction')
        .resolves([]);

      await connectionUpdatedDetectIncome(data.userId, data.bankConnectionId, data.bankAccountIds);

      sandbox.assert.callCount(detectStub, data.bankAccountIds.length);

      data.bankAccountIds.forEach((bankAccountId, i) => {
        const [userId, account] = detectStub.getCall(i).args;
        expect(userId).to.equal(data.userId);
        expect(account.id).to.equal(accounts[i].id);
      });
    });

    it('should send notification for each new income', async () => {
      const rec0 = await factory.create('recurring-transaction', { id: 1000 });
      const rec1 = await factory.create('recurring-transaction', { id: 1001 });

      sandbox
        .stub(DetectRecurringIncome, 'addUndetectedRecurringTransaction')
        .callsFake(constant(Promise.resolve([rec0, rec1])));

      const account = await factory.create('checking-account');
      const data = makeBankConnectionUpdatedEventData([account]);
      await connectionUpdatedDetectIncome(data.userId, data.bankConnectionId, data.bankAccountIds);

      sandbox.assert.calledTwice(notificationStub);
      const args0 = notificationStub.getCall(0).args;
      expect(args0[0].id).to.equal(rec0.id);
      expect(args0[1]).to.equal(ModificationSource.System);

      const args1 = notificationStub.getCall(1).args;
      expect(args1[0].id).to.equal(rec1.id);
      expect(args1[1]).to.equal(ModificationSource.System);

      sandbox.assert.notCalled(transitionIncomeStub);
    });
  });

  describe('rate limit', () => {
    after(() => sandbox.restore());

    it('should rate limit', async () => {
      const account = await factory.create('checking-account');

      const detectStub = sandbox
        .stub(DetectRecurringIncome, 'addUndetectedRecurringTransaction')
        .resolves([]);

      await connectionUpdatedDetectIncome(account.userId, account.bankConnectionId, [account.id]);

      sandbox.assert.calledOnce(detectStub);
      const [userId, accountArg] = detectStub.firstCall.args;
      expect(userId).to.equal(account.userId);
      expect(accountArg.id).to.equal(account.id);

      const canRunAgain = !(await isRateLimited(account.userId, account.bankConnectionId));
      expect(canRunAgain).to.equal(false);
    });

    it('should not increment rate limiter on detection failure', async () => {
      const account = await factory.create('checking-account');

      sandbox.stub(DetectRecurringIncome, 'addUndetectedRecurringTransaction').rejects('boo');

      const attempt = connectionUpdatedDetectIncome(account.userId, account.bankConnectionId, [
        account.id,
      ]);
      await expect(attempt).to.be.rejected;

      const canRunAgain = !(await isRateLimited(account.userId, account.bankConnectionId));
      expect(canRunAgain).to.equal(true);
    });
  });

  describe('use read replica', () => {
    afterEach(() => sandbox.restore());

    [true, false].forEach(shouldUseReplica => {
      it(`should use read replica is ${shouldUseReplica}`, async () => {
        useReplicaStub.resolves(shouldUseReplica);

        const account = await factory.create('checking-account');
        const updateType = BankConnectionUpdateType.DEFAULT_UPDATE;
        const data: IBankConnectionUpdateCompletedEventData = {
          userId: account.userId,
          bankConnectionId: account.bankConnectionId,
          bankAccountIds: [account.id],
          updateType,
          connection: null,
          bankAccounts: [],
          options: null,
        };

        const detectStub = sandbox
          .stub(DetectRecurringIncome, 'addUndetectedRecurringTransaction')
          .resolves([]);

        await onProcessData(data, {
          publishTime: {
            toStruct: () => ({ seconds: Date.now() / 1000 }),
          },
        } as any);

        const detectOptions = detectStub.firstCall.args[3];
        expect(detectOptions.useReadReplica).to.equal(shouldUseReplica);

        sinon.assert.calledOnce(useReplicaStub);
      });
    });

    it('should not use read replica for new users - HISTORICAL_UPDATE', async () => {
      const account = await factory.create('checking-account');
      const updateType = BankConnectionUpdateType.HISTORICAL_UPDATE;
      const data: IBankConnectionUpdateCompletedEventData = {
        userId: account.userId,
        bankConnectionId: account.bankConnectionId,
        bankAccountIds: [account.id],
        updateType,
        connection: null,
        bankAccounts: [],
        options: null,
      };

      const detectStub = sandbox
        .stub(DetectRecurringIncome, 'addUndetectedRecurringTransaction')
        .resolves([]);

      await onProcessData(data, {
        publishTime: {
          toStruct: () => ({ seconds: Date.now() / 1000 }),
        },
      } as any);

      const detectOptions = detectStub.firstCall.args[3];
      expect(detectOptions.useReadReplica).to.equal(false);

      sinon.assert.notCalled(useReplicaStub);
    });

    it('should not use read replica for new users - INITIAL_UPDATE', async () => {
      const account = await factory.create('checking-account');
      const updateType = BankConnectionUpdateType.INITIAL_UPDATE;
      const data: IBankConnectionUpdateCompletedEventData = {
        userId: account.userId,
        bankConnectionId: account.bankConnectionId,
        bankAccountIds: [account.id],
        updateType,
        connection: null,
        bankAccounts: [],
        options: null,
      };

      const detectStub = sandbox
        .stub(DetectRecurringIncome, 'addUndetectedRecurringTransaction')
        .resolves([]);

      await onProcessData(data, {
        publishTime: {
          toStruct: () => ({ seconds: Date.now() / 1000 }),
        },
      } as any);

      const detectOptions = detectStub.firstCall.args[3];
      expect(detectOptions.useReadReplica).to.equal(false);

      sinon.assert.notCalled(useReplicaStub);
    });

    it('should throw RetriableError on replica deferrals', async () => {
      useReplicaStub.throws(new ReadReplica.TaskTooEarlyError('boop'));

      const account = await factory.create('checking-account');
      const updateType = BankConnectionUpdateType.DEFAULT_UPDATE;
      const data: IBankConnectionUpdateCompletedEventData = {
        userId: account.userId,
        bankConnectionId: account.bankConnectionId,
        bankAccountIds: [account.id],
        updateType,
        connection: null,
        bankAccounts: [],
        options: null,
      };

      const result = onProcessData(data, {
        publishTime: {
          toStruct: () => ({ seconds: Date.now() / 1000 }),
        },
      } as any);

      await expect(result).to.be.rejectedWith(RetriableError);
    });
  });

  describe('bank account selection', () => {
    it('should trigger income detection on bank accounts without income', async () => {
      const account0 = await factory.create('checking-account');
      const bankConnectionInfo = pick(account0, ['userId', 'bankConnectionId']);
      const accounts = [
        account0,
        await factory.create('checking-account', bankConnectionInfo),
        await factory.create('checking-account', bankConnectionInfo),
      ];
      await factory.create('recurring-transaction', {
        userId: account0.userId,
        bankAccountId: account0.id,
        userAmount: 100,
      });

      const data = makeBankConnectionUpdatedEventData(accounts);
      const event = {
        publishTime: {
          toStruct: () => ({ sceonds: 1000 }),
        },
      };

      const stub = sandbox
        .stub(DetectRecurringIncome, 'addUndetectedRecurringTransaction')
        .resolves([]);

      await onProcessData(data, event as any);

      sandbox.assert.callCount(stub, 2);
      // accouts 0 has income, should not be invoked

      sandbox.assert.calledWith(stub.getCall(0), data.userId, matchAccount(accounts[1].id));
      sandbox.assert.calledWith(
        stub.getCall(1),
        data.userId,
        sinon.match((account: BankAccount) => account.id === accounts[2].id),
      );
    });

    it('should not trigger income on unsupported bank accounts', async () => {
      const checkingAccount = await factory.create('checking-account');
      const bankConnectionInfo = pick(checkingAccount, ['userId', 'bankConnectionId']);
      const savingsAccount = await factory.create('savings-account', bankConnectionInfo);
      const loanAccount = await factory.create(
        'bank-account',
        Object.assign(bankConnectionInfo, {
          type: BankAccountType.Loan,
        }),
      );
      const data = makeBankConnectionUpdatedEventData([
        checkingAccount,
        savingsAccount,
        loanAccount,
      ]);
      const event = {
        publishTime: {
          toStruct: () => ({ sceonds: 1000 }),
        },
      };

      const detectStub = sandbox
        .stub(DetectRecurringIncome, 'addUndetectedRecurringTransaction')
        .resolves([]);

      await onProcessData(data, event as any);

      sandbox.assert.calledOnce(detectStub);

      sandbox.assert.calledWith(detectStub, data.userId, matchAccount(checkingAccount.id));

      sandbox.assert.neverCalledWith(detectStub, data.userId, matchAccount(savingsAccount.id));
      sandbox.assert.neverCalledWith(detectStub, data.userId, matchAccount(loanAccount.id));
    });
  });

  describe('setMainPaychecks', () => {
    it('sets main paycheck for bank accounts that dont have it set', async () => {
      const oldPaycheck = await factory.create('recurring-transaction');
      const accountWithPaycheck = await factory.create<BankAccount>('bank-account', {
        mainPaycheckRecurringTransactionId: oldPaycheck.id,
      });
      const accountWithoutPaycheck = await factory.create<BankAccount>('bank-account', {
        mainPaycheckRecurringTransactionId: null,
      });

      const incomes = await Promise.all([
        factory.create('recurring-transaction', {
          bankAccountId: accountWithPaycheck.id,
          userId: accountWithPaycheck.userId,
        }),
        factory.create('recurring-transaction', {
          bankAccountId: accountWithoutPaycheck.id,
          userId: accountWithoutPaycheck.userId,
        }),
      ]);

      await setMainPaychecks(incomes);

      await Promise.all([accountWithoutPaycheck.reload(), accountWithPaycheck.reload()]);

      expect(accountWithPaycheck.mainPaycheckRecurringTransactionId).to.eq(oldPaycheck.id);
      expect(accountWithoutPaycheck.mainPaycheckRecurringTransactionId).to.eq(incomes[1].id);
    });

    it('picks paycheck with the highest amount', async () => {
      const account = await factory.create<BankAccount>('bank-account', {
        mainPaycheckRecurringTransactionId: null,
      });

      const [lowerIncome, higherIncome] = await Promise.all([
        factory.create('recurring-transaction', {
          bankAccountId: account.id,
          userId: account.userId,
          userAmount: 10,
        }),
        factory.create('recurring-transaction', {
          bankAccountId: account.id,
          userId: account.userId,
          userAmount: 100,
        }),
      ]);

      await setMainPaychecks([lowerIncome, higherIncome]);

      await Promise.all([account.reload()]);

      expect(account.mainPaycheckRecurringTransactionId).to.eq(higherIncome.id);
    });

    it('does nothing when no incomes are detected', async () => {
      await expect(setMainPaychecks([])).to.eventually.be.fulfilled;
    });
  });

  describe('set detection status', () => {
    it('should mark detection status as done on INITIAL_UPDATE', async () => {
      const account = await factory.create('checking-account');
      const updateType = BankConnectionUpdateType.INITIAL_UPDATE;
      const data: IBankConnectionUpdateCompletedEventData = {
        userId: account.userId,
        bankConnectionId: account.bankConnectionId,
        bankAccountIds: [account.id],
        updateType,
        connection: null,
        bankAccounts: [],
        options: null,
      };

      sandbox.stub(DetectRecurringIncome, 'addUndetectedRecurringTransaction').resolves([]);

      await onProcessData(data, {
        publishTime: {
          toStruct: () => ({ seconds: Date.now() / 1000 }),
        },
      } as any);

      expect(detectionStatusStub.callCount).to.equal(1);
      expect(detectionStatusStub.firstCall.args[0]).to.equal(account.id);
    });
  });
});
