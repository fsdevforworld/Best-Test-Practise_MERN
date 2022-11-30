import * as sinon from 'sinon';
import { BankAccount } from '../../../../src/models';
import factory from '../../../factories';
import { clean } from '../../../test-helpers';
import {
  onProcessData,
  sendNotifications,
} from '../../../../src/domain/recurring-transaction/consumers/bank-connection-update-new-expenses';
import * as DetectRecurring from '../../../../src/domain/recurring-transaction/detect-recurring-transaction';
import {
  ModificationSource,
  RecurringTransaction,
} from '../../../../src/domain/recurring-transaction/types';
import Notifications from '../../../../src/domain/recurring-transaction/notifications';
import * as Experiment from '../../../../src/experiments/auto-add-expenses-experiment';
import * as AutoUpdateExpenseRateLimiter from '../../../../src/domain/recurring-transaction/auto-update-expense-rate-limiter';
import {
  BankConnectionUpdateType,
  IBankConnectionUpdateCompletedEventData,
  TransactionType,
} from '../../../../src/typings';
import { RecurringTransactionInterval } from '@dave-inc/wire-typings';
import {
  metrics,
  RecurringTransactionMetrics as Metrics,
} from '../../../../src/domain/recurring-transaction/metrics';

describe('bank-connection-update-new-expenses consumer', () => {
  const sandbox = sinon.createSandbox();
  after(() => clean(sandbox));

  describe('onProcessData', () => {
    let detectRecurringStub: sinon.SinonStub;
    let metricsStub: sinon.SinonStub;
    beforeEach(async () => {
      await clean(sandbox);
      sandbox.stub(Notifications, 'notifyExpensesPredicted');
      sandbox.stub(Notifications, 'notifyAddExpense');
      metricsStub = sandbox.stub(metrics, 'increment');
      detectRecurringStub = sandbox
        .stub(DetectRecurring, 'addUndetectedRecurringTransaction')
        .returns([]);
    });

    it('should trigger detection on default update', async () => {
      const expectedBankId = 12345;
      const expectedUserId = 4567;
      const testBankConnectionId = 1111;
      const account = await factory.build('checking-account', {
        id: expectedBankId,
        userId: expectedUserId,
        bankConnectionId: testBankConnectionId,
      });
      sandbox.stub(AutoUpdateExpenseRateLimiter, 'getLimited').resolves(false);
      sandbox.stub(Experiment, 'isBucketed').returns(true);
      sandbox
        .stub(BankAccount, 'getSupportedAccountsByBankConnectionId')
        .withArgs(testBankConnectionId)
        .returns([account]);
      const data = createTopicMessage([account], BankConnectionUpdateType.DEFAULT_UPDATE);

      await onProcessData(data);

      sandbox.assert.calledWith(metricsStub, Metrics.NEW_EXPENSE_DETECTION_ATTEMPT);
      sandbox.assert.calledWith(metricsStub, Metrics.NEW_EXPENSE_DETECTION_SUCCESS);
      sandbox.assert.calledOnce(detectRecurringStub);
      sandbox.assert.calledWithExactly(
        detectRecurringStub,
        expectedUserId,
        account,
        TransactionType.EXPENSE,
        { filterInterval: RecurringTransactionInterval.MONTHLY, useReadReplica: true },
      );
    });

    it('should trigger detection on historical update', async () => {
      const expectedBankId = 123;
      const expectedUserId = 456;
      const testBankConnectionId = 123456;
      const account = await factory.build('checking-account', {
        id: expectedBankId,
        userId: expectedUserId,
        bankConnectionId: testBankConnectionId,
      });
      sandbox.stub(AutoUpdateExpenseRateLimiter, 'getLimited').resolves(false);
      sandbox.stub(Experiment, 'isBucketed').returns(true);
      sandbox
        .stub(BankAccount, 'getSupportedAccountsByBankConnectionId')
        .withArgs(testBankConnectionId)
        .returns([account]);
      const data = createTopicMessage([account], BankConnectionUpdateType.HISTORICAL_UPDATE);

      await onProcessData(data);

      sandbox.assert.calledWith(metricsStub, Metrics.NEW_EXPENSE_DETECTION_ATTEMPT);
      sandbox.assert.calledWith(metricsStub, Metrics.NEW_EXPENSE_DETECTION_SUCCESS);
      sandbox.assert.calledOnce(detectRecurringStub);
      sandbox.assert.calledWithExactly(
        detectRecurringStub,
        expectedUserId,
        account,
        TransactionType.EXPENSE,
        { filterInterval: RecurringTransactionInterval.MONTHLY, useReadReplica: true },
      );
    });

    it('should NOT trigger detection on inital update', async () => {
      const account = await factory.build('checking-account');
      sandbox.stub(AutoUpdateExpenseRateLimiter, 'getLimited').resolves(false);
      sandbox.stub(Experiment, 'isBucketed').returns(true);
      const data = createTopicMessage([account], BankConnectionUpdateType.INITIAL_UPDATE);

      await onProcessData(data);

      sandbox.assert.notCalled(metricsStub);
      sandbox.assert.notCalled(detectRecurringStub);
    });

    it('should NOT trigger if user not bucketed into experiment', async () => {
      const testUserid = 12345;
      const account = await factory.build('checking-account', { userId: testUserid });
      sandbox.stub(AutoUpdateExpenseRateLimiter, 'getLimited').returns(false);
      sandbox
        .stub(Experiment, 'isBucketed')
        .withArgs(testUserid)
        .returns(false);
      const data = createTopicMessage([account], BankConnectionUpdateType.HISTORICAL_UPDATE);

      await onProcessData(data);

      sandbox.assert.notCalled(metricsStub);
      sandbox.assert.notCalled(detectRecurringStub);
    });

    it('should NOT trigger if user is rate limited', async () => {
      const testUserId = 98765;
      const testBankConnectionId = 121212;
      const account = await factory.build('checking-account', {
        userId: testUserId,
        bankConnectionId: testBankConnectionId,
      });
      sandbox
        .stub(AutoUpdateExpenseRateLimiter, 'getLimited')
        .withArgs(testUserId, testBankConnectionId)
        .resolves(true);
      sandbox
        .stub(Experiment, 'isBucketed')
        .withArgs(testUserId)
        .returns(true);
      const data = createTopicMessage([account], BankConnectionUpdateType.HISTORICAL_UPDATE);
      sandbox
        .stub(BankAccount, 'getSupportedAccountsByBankConnectionId')
        .withArgs(testBankConnectionId)
        .returns([account]);

      await onProcessData(data);

      sandbox.assert.calledWith(metricsStub, Metrics.NEW_EXPENSE_DETECTION_RATE_LIMITED);
      sandbox.assert.notCalled(detectRecurringStub);
    });

    it('should rate limit user after successfully triggering', async () => {
      const expectedBankId = 12345;
      const expectedUserId = 4567;
      const expectedBankConnId = 1111;
      const account = await factory.build('checking-account', {
        id: expectedBankId,
        userId: expectedUserId,
        bankConnectionId: expectedBankConnId,
      });
      sandbox.stub(AutoUpdateExpenseRateLimiter, 'getLimited').resolves(false);
      sandbox.stub(Experiment, 'isBucketed').returns(true);
      sandbox
        .stub(BankAccount, 'getSupportedAccountsByBankConnectionId')
        .withArgs(expectedBankConnId)
        .returns([account]);
      const data = createTopicMessage([account], BankConnectionUpdateType.DEFAULT_UPDATE);

      const setExpenseCacheStub = sandbox.stub(AutoUpdateExpenseRateLimiter, 'setLimited');
      await onProcessData(data);

      sandbox.assert.calledOnce(setExpenseCacheStub);
      sandbox.assert.calledWithExactly(setExpenseCacheStub, expectedUserId, expectedBankConnId);
    });

    describe('sendNotifications', () => {
      let notifyExpensesPredictedStub: sinon.SinonStub;
      let notifyAddExpenseStub: sinon.SinonStub;

      beforeEach(async () => {
        await clean(sandbox);
        notifyExpensesPredictedStub = sandbox.stub(Notifications, 'notifyExpensesPredicted');
        notifyAddExpenseStub = sandbox.stub(Notifications, 'notifyAddExpense');
      });

      after(() => clean(sandbox));

      it('should send notifications for recurring transactions', async () => {
        const userId = 1;
        const txns = [{ id: 1 }, { id: 2 }] as RecurringTransaction[];
        await sendNotifications(userId, txns);
        sandbox.assert.calledOnce(notifyExpensesPredictedStub);
        sandbox.assert.calledWithExactly(
          notifyExpensesPredictedStub,
          userId,
          txns.length,
          ModificationSource.System,
          'auto add',
        );
        sandbox.assert.callCount(notifyAddExpenseStub, txns.length);
        sandbox.assert.calledWithExactly(
          notifyAddExpenseStub.getCall(0),
          txns[0],
          ModificationSource.System,
          'auto add',
        );
        sandbox.assert.calledWithExactly(
          notifyAddExpenseStub.getCall(1),
          txns[1],
          ModificationSource.System,
          'auto add',
        );
      });

      it('should send predicted expenses event even if there are zero', async () => {
        const userId = 1;
        await sendNotifications(userId, []);
        sandbox.assert.calledOnce(notifyExpensesPredictedStub);
        sandbox.assert.calledWithExactly(
          notifyExpensesPredictedStub,
          userId,
          0,
          ModificationSource.System,
          'auto add',
        );
        sandbox.assert.notCalled(notifyAddExpenseStub);
      });
    });
  });

  function createTopicMessage(
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
});
