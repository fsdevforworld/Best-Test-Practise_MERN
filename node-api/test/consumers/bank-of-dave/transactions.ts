import { moment } from '@dave-inc/time-lib';
import {
  BankAccountSubtype,
  BankAccountType,
  BankingDataSource,
  DaveBankingPubSubAccount,
  DaveBankingPubSubTransaction,
} from '@dave-inc/wire-typings';
import { expect } from 'chai';
import * as Config from 'config';
import * as _ from 'lodash';
import { isNil } from 'lodash';
import * as sinon from 'sinon';
import { handleMessage } from '../../../src/consumers/bank-of-dave/transactions/consumer';
import BankOfDaveInternalApiIntegration from '../../../src/domain/banking-data-source/bank-of-dave-internal/integration';
import * as CollectionDomain from '../../../src/domain/collection';
import * as EventDomain from '../../../src/domain/event';
import * as Forecast from '../../../src/domain/forecast';
import * as Notification from '../../../src/domain/notifications';
import * as NotificationDomain from '../../../src/domain/notifications';
import * as RecurringTransactionJobs from '../../../src/domain/recurring-transaction/jobs';
import * as Jobs from '../../../src/jobs/data';
import * as appsflyer from '../../../src/lib/appsflyer';
import BankingDataClient from '../../../src/lib/heath-client';
import {
  BankAccount,
  BankConnection,
  BankTransaction,
  SubscriptionBilling,
  User,
} from '../../../src/models';
import {
  AnalyticsEvent,
  BalanceLogCaller,
  BankAccountResponse,
  BankConnectionUpdateType,
  BankTransactionResponse,
} from '../../../src/typings';
import factory from '../../factories';
import { clean, stubBalanceLogClient, stubBankTransactionClient } from '../../test-helpers';

describe('Consume Bank of Dave Transactions Worker', () => {
  const sandbox = sinon.createSandbox();
  let collectTaskStub: sinon.SinonStub;
  let collectSubscriptionStub: sinon.SinonStub;
  let createMarketingEventsForUserStub: sinon.SinonStub;
  let bankConnectionUpdateCompletedEventStub: sinon.SinonStub;

  beforeEach(async () => {
    await clean(sandbox);

    collectTaskStub = sandbox.stub(Jobs, 'createCollectAfterBankAccountUpdateTask');
    collectSubscriptionStub = sandbox.stub(Jobs, 'collectPastDueSubscriptionTask');
    sandbox.stub(Jobs, 'createMatchDisbursementBankTransactionTask');
    sandbox.stub(Jobs, 'createBroadcastBankDisconnectTask');
    stubBalanceLogClient(sandbox);
    stubBankTransactionClient(sandbox);
    sandbox
      .stub(Config, 'get')
      .withArgs('dave.bankOfDaveInternalApi.useInternalApiForDataSource')
      .returns(false);
    (Config.get as sinon.SinonStub).callThrough();
    createMarketingEventsForUserStub = sandbox.stub(
      NotificationDomain,
      'createMarketingEventsForUser',
    );
    sandbox.stub(RecurringTransactionJobs, 'createUpdateExpectedTransactionsTask');
    bankConnectionUpdateCompletedEventStub = sandbox
      .stub(EventDomain.bankConnectionUpdateCompletedEvent, 'publish')
      .resolves();

    sandbox.stub(appsflyer, 'logAppsflyerEvent');
  });

  after(() => clean(sandbox));

  describe('handleMessage', () => {
    const bankAccountExternalId = 'a805b97d2f1246d59e3cb62c86a7770c';
    let bankAccount: BankAccount;
    let bankConnection: BankConnection;
    let message: any;
    let data: any;

    const expectedAccount: BankAccountResponse = {
      externalId: bankAccountExternalId,
      type: BankAccountType.Depository,
      subtype: BankAccountSubtype.Checking,
      available: 110,
      current: 110,
      lastFour: '3456',
      nickname: 'my nick',
      bankingDataSource: BankingDataSource.BankOfDave,
    };

    const expectedTransactions: BankTransactionResponse[] = [
      {
        externalId: 'extern-1',
        bankAccountExternalId,
        amount: 1200.56,
        transactionDate: moment('2020-04-01'),
        pending: false,
        externalName: 'KMART',
        plaidCategoryId: '1234',
      },
      {
        externalId: 'extern-2',
        bankAccountExternalId,
        amount: 1.45,
        transactionDate: moment('2020-04-20'),
        pending: false,
        externalName: 'Target',
        plaidCategoryId: '9876',
      },
      {
        externalId: 'extern-3',
        bankAccountExternalId,
        amount: 0.67,
        transactionDate: moment('2020-05-09'),
        pending: true,
        externalName: 'The Dollar Stoor',
      },
    ];

    let messageTransactions: DaveBankingPubSubTransaction[];
    let messageAccount: DaveBankingPubSubAccount;

    beforeEach(async () => {
      sandbox
        .stub(BankOfDaveInternalApiIntegration.prototype, 'getAccounts')
        .resolves([expectedAccount]);

      bankConnection = await factory.create('bank-connection', {
        bankingDataSource: BankingDataSource.BankOfDave,
        lastPull: moment(),
      });
      bankAccount = await factory.create('checking-account', {
        bankConnectionId: bankConnection.id,
        externalId: bankAccountExternalId,
        userId: bankConnection.userId,
        current: 1000000,
        available: 1000000,
      });

      messageTransactions = expectedTransactions.map(x => {
        return {
          uuid: x.externalId,
          debit: false,
          amount: x.amount,
          pending: x.pending,
          source: {
            name: x.externalName,
            legalNames: [x.externalName],
          },
          transactedAt: x.transactionDate.toISOString(),
          settledAt: '',

          created: x.transactionDate.toISOString(),
          updated: x.transactionDate.subtract(1, 'days').toISOString(),
          returnedMessage: '',
          returned: false,
          cancelled: false,
          mcc: !isNil(x.plaidCategoryId) ? x.plaidCategoryId : undefined,
          isCardTransaction: true,
        };
      });

      // Make the first message be a direct deposit
      messageTransactions[0].source.meta = { directDeposit: true };
      messageTransactions[0].debit = false;

      messageAccount = {
        uuid: expectedAccount.externalId,
      };

      data = {
        account: messageAccount,
        transactions: messageTransactions,
      };

      message = await factory.build('pub-sub-event', {
        data: Buffer.from(
          JSON.stringify({
            account: messageAccount,
            transactions: messageTransactions,
          }),
        ),
      });
    });

    it('should save all the fetched transactions to the database', async () => {
      let bankTransactionCount = await BankTransaction.count();
      expect(bankTransactionCount).to.equal(0);

      await handleMessage(message, data);

      bankTransactionCount = await BankTransaction.count();
      expect(bankTransactionCount).to.equal(expectedTransactions.length);
    });

    it('should only delete transactions that change status to canceled or returned', async () => {
      await handleMessage(message, data);

      const originalBankTransactions = await BankTransaction.findAll();
      const originalTransactionCount = expectedTransactions.length;
      expect(originalTransactionCount).to.be.greaterThan(0);
      expect(originalBankTransactions).to.have.lengthOf(originalTransactionCount);

      const newTransactionData = _.cloneDeep(messageTransactions);
      newTransactionData[0].cancelled = true;

      data.transactions = newTransactionData;

      await handleMessage(message, data);

      const resultBankTransactions = await BankTransaction.findAll();

      expect(resultBankTransactions).to.have.lengthOf(originalTransactionCount - 1);
    });

    it('should delete all canceled transactions', async () => {
      await handleMessage(message, data);

      const originalBankTransactions = await BankTransaction.findAll();
      const originalTransactionCount = expectedTransactions.length;
      expect(originalTransactionCount).to.be.greaterThan(0);
      expect(originalBankTransactions).to.have.lengthOf(originalTransactionCount);

      const newTransactionData = _.cloneDeep(messageTransactions);
      newTransactionData[0].cancelled = true;
      newTransactionData[1].cancelled = true;
      newTransactionData[2].cancelled = true;

      data.transactions = newTransactionData;

      await handleMessage(message, data);

      const resultBankTransactions = await BankTransaction.findAll();

      expect(resultBankTransactions).to.have.lengthOf(0);
    });

    it('should update the balance for the related account', async () => {
      expect(bankAccount.current).to.not.equal(expectedAccount.current);
      expect(bankAccount.available).to.not.equal(expectedAccount.available);

      await handleMessage(message, data);

      await bankAccount.reload();
      expect(bankAccount.current).to.equal(expectedAccount.current);
      expect(bankAccount.available).to.equal(expectedAccount.available);
    });

    it('should store MCC code when available', async () => {
      await handleMessage(message, data);

      const mccById: any = {};
      data.transactions.forEach((msg: DaveBankingPubSubTransaction) => {
        const mcc = !isNil(msg.mcc) ? msg.mcc.toString() : null;
        mccById[msg.uuid] = mcc;
      });

      const bankTransactions = await BankTransaction.findAll();

      bankTransactions.forEach(t => expect(t.plaidCategoryId).to.equal(mccById[t.externalId]));
    });

    it('should publish a marketing event for a settled direct deposit', async () => {
      await handleMessage(message, data);

      expect(createMarketingEventsForUserStub).to.have.been.calledWith(
        bankAccount.userId.toString(),
        AnalyticsEvent.AchCreditDirectDepositSettled,
        {
          amount: messageTransactions[0].amount,
          description: messageTransactions[0].source.name,
        },
      );

      // @ts-ignore
      expect(appsflyer.logAppsflyerEvent.args[0][0]).to.deep.equal({
        userId: bankAccount.userId,
        eventName: appsflyer.AppsFlyerEvents.DAVE_CHECKING_DIRECT_DEPOSIT_RECEIVED,
      });

      // @ts-ignore
      expect(appsflyer.logAppsflyerEvent.args[1][0]).to.deep.equal({
        userId: bankAccount.userId,
        eventName: appsflyer.AppsFlyerEvents.DAVE_CHECKING_DEPOSIT_RECEIVED,
      });
    });

    it('should enqueue a past due subscription collection job', async () => {
      await handleMessage(message, data);

      const [job] = collectSubscriptionStub.firstCall.args;
      expect(job.trigger).to.deep.equal('bank-account-update');
      expect(job.userId).to.deep.equal(bankConnection.userId);
    });

    it('should update the account forecast', async () => {
      const spy = sandbox.spy(Forecast, 'computeAccountForecast');

      await handleMessage(message, data);

      sinon.assert.called(spy);
    });

    it('should attempt collections if a settled transaction is handled', async () => {
      const spy = sandbox.spy(CollectionDomain, 'collectPastDueSubscriptionPayment');

      data.transactions = [data.transactions[0]];

      await handleMessage(message, data);

      sinon.assert.called(collectTaskStub);
      sinon.assert.called(spy);
    });

    it('should attempt collections if a pending transaction is handled', async () => {
      const spy = sandbox.spy(CollectionDomain, 'collectPastDueSubscriptionPayment');

      data.transactions = [
        {
          ...data.transactions[0],
          pending: true,
        },
      ];

      await handleMessage(message, data);

      sinon.assert.called(collectTaskStub);
      sinon.assert.called(spy);
    });

    it('should not attempt collections if a cancelled transaction is handled', async () => {
      const spy = sandbox.spy(CollectionDomain, 'collectPastDueSubscriptionPayment');

      data.transactions = [
        {
          ...data.transactions[0],
          cancelled: true,
        },
      ];

      await handleMessage(message, data);

      sinon.assert.notCalled(collectTaskStub);
      sinon.assert.notCalled(spy);
    });

    it('should not attempt collections if a no pending or settled or cancelled transactions are handled', async () => {
      const spy = sandbox.spy(CollectionDomain, 'collectPastDueSubscriptionPayment');

      data.transactions = [
        {
          ...data.transactions[0],
          returned: true,
        },
      ];

      await handleMessage(message, data);

      sinon.assert.notCalled(collectTaskStub);
      sinon.assert.notCalled(spy);
    });

    it('should broadcast the account forecast if there is no defaultBankAccountId set', async () => {
      const spy = sandbox.spy(Notification, 'sendForecastAlerts');
      const user: User = await bankConnection.getUser();

      expect(user.defaultBankAccountId).to.equal(null);
      await handleMessage(message, data);

      sinon.assert.called(spy);
    });

    it('should broadcast the account forecast if defaultBankAccountId is set to this account', async () => {
      const spy = sandbox.spy(Notification, 'sendForecastAlerts');
      const user: User = await bankConnection.getUser();
      await user.update({ defaultBankAccountId: bankAccount.id });

      expect(user.defaultBankAccountId).to.equal(bankAccount.id);
      await handleMessage(message, data);

      sinon.assert.called(spy);
    });

    it('should broadcast the account forecast if defaultBankAccountId is set to this account', async () => {
      const spy = sandbox.spy(Notification, 'sendForecastAlerts');
      const user: User = await bankConnection.getUser();
      await user.update({ defaultBankAccountId: bankAccount.id + 1 });

      expect(user.defaultBankAccountId).to.not.equal(bankAccount.id);
      await handleMessage(message, data);

      sinon.assert.called(spy);
    });

    it('should create a balance log entry for the current date', async () => {
      await handleMessage(message, data);

      const logs = await BankingDataClient.getBalanceLogs(bankAccount.id, {
        start: moment().startOf('day'),
        end: moment().endOf('day'),
      });
      const balanceLog = logs[0];

      expect(balanceLog.available).to.equal(expectedAccount.available);
      expect(balanceLog.current).to.equal(expectedAccount.current);
    });

    it('should backfill balance logs for bank of dave accounts', async () => {
      await bankConnection.update({ lastPull: moment().subtract(4, 'days') });

      await handleMessage(message, data);

      const balanceLogs = await BankingDataClient.getBalanceLogs(bankAccount.id, {
        start: moment()
          .subtract(10, 'years')
          .startOf('day'),
        end: moment().endOf('day'),
      });

      expect(balanceLogs.length).to.eq(4);
    });

    it('should set the last pull for the bank account', async () => {
      await handleMessage(message, data);

      await bankConnection.reload();
      expect(bankConnection.lastPull.format('YYYY-MM-DD')).to.eq(moment().format('YYYY-MM-DD'));
    });

    it('should not create a subscription billing if the user is already subscribed', async () => {
      let subscriptionBillingCount = await SubscriptionBilling.count();
      expect(subscriptionBillingCount).to.equal(0);

      const user = await User.findByPk(bankConnection.userId);
      expect(user.subscriptionStart).to.not.equal(null);

      await handleMessage(message, data);

      await user.reload();
      expect(user.subscriptionStart).to.not.equal(null);
      subscriptionBillingCount = await SubscriptionBilling.count();
      expect(subscriptionBillingCount).to.equal(0);
    });

    it('should publish a bankConnectionUpdateCompletedEvent', async () => {
      const user = await User.findByPk(bankConnection.userId);

      await handleMessage(message, data);

      sinon.assert.calledWithExactly(bankConnectionUpdateCompletedEventStub, {
        bankConnectionId: bankConnection.id,
        userId: user.id,
        bankAccountIds: [bankAccount.id],
        updateType: BankConnectionUpdateType.DEFAULT_UPDATE,
        connection: {
          authToken: bankConnection.authToken,
          externalId: bankConnection.externalId,
          userId: bankConnection.userId,
          bankingDataSource: bankConnection.bankingDataSource,
          lastPull: bankConnection.lastPull.format(),
        },
        bankAccounts: [{ id: bankAccount.id.toString(), externalId: bankAccount.externalId }],
        options: {
          historical: false,
          source: BalanceLogCaller.BankOfDaveTransactionsPubsubConsumer,
          initialPull: false,
        },
      });
    });
  });
});
