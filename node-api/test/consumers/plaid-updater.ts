import * as plaid from 'plaid';
import { AccountsResponse, Item, TransactionsResponse } from 'plaid';
import * as sinon from 'sinon';
import factory from '../factories';
import { processEventWithLock } from '../../src/consumers/plaid-updater';
import * as Forecast from '../../src/domain/forecast';
import { AuditLog, BankAccount, BankConnection, BankTransaction } from '../../src/models';
import * as RedisLock from '../../src/lib/redis-lock';
import { expect } from 'chai';
import { clean, stubBalanceLogClient } from '../test-helpers';
import plaidClient from '../../src/lib/plaid';
import pubsub from '../../src/lib/pubsub';
import { moment } from '@dave-inc/time-lib';
import BankingDataClient from '../../src/lib/heath-client';
import { bankConnectionUpdateCompletedEvent, recordEvent } from '../../src/domain/event';
import * as Notification from '../../src/domain/notifications';
import SynapsepayNodeLib from '../../src/domain/synapsepay/node';
import * as Jobs from '../../src/jobs/data';
import {
  BankConnectionUpdateType,
  BankingDataSourceErrorType,
  EventTopic,
  PLAID_WEBHOOK_CODE,
  PlaidErrorCode,
  UnderwritingMLScoreEventTrigger,
} from '../../src/typings';
import redis from '../../src/lib/redis';
import * as BankingDataSync from '../../src/domain/banking-data-sync';
import { BankingDataSourceError } from '../../src/domain/banking-data-source/error';
import { BankingDataSource } from '@dave-inc/wire-typings';
import * as RecurringTransaction from '../../src/domain/recurring-transaction';
import * as RecurringTransactionJobs from '../../src/domain/recurring-transaction/jobs';
import stubBankTransactionClient, {
  upsertBankTransactionForStubs,
} from '../test-helpers/stub-bank-transaction-client';

describe('Plaid Updater', () => {
  const sandbox = sinon.createSandbox();
  let updateCompletedStub: sinon.SinonStub;
  let stitchOldAccountTransactionsStub: sinon.SinonStub;
  let markInitialDetectionStub: sinon.SinonStub;

  before(() => clean());

  beforeEach(() => {
    updateCompletedStub = sandbox.stub(bankConnectionUpdateCompletedEvent, 'publish');
    sandbox.stub(recordEvent, 'publish');
    sandbox.stub(Jobs, 'createCollectAfterBankAccountUpdateTask');
    sandbox.stub(Jobs, 'createMatchDisbursementBankTransactionTask');
    markInitialDetectionStub = sandbox.stub(
      RecurringTransaction,
      'setInitialIncomeDetectionRequired',
    );
    sandbox.stub(RecurringTransactionJobs, 'createUpdateExpectedTransactionsTask');
    stitchOldAccountTransactionsStub = sandbox.stub(Jobs, 'createStitchOldAccountTransactionsTask');
    stubBalanceLogClient(sandbox);
    stubBankTransactionClient(sandbox);
  });

  afterEach(() => clean(sandbox));

  describe('processEventWithLock', () => {
    context('when process event succeeds', () => {
      let message: any;

      beforeEach(async () => {
        const user = await factory.create('user', {
          subscriptionStart: null,
        });

        const bankConnection = await factory.create('bank-connection', { userId: user.id });

        let bankAccount: BankAccount;
        [bankAccount, message] = await Promise.all([
          factory.create('bank-account', {
            bankConnectionId: bankConnection.id,
            userId: user.id,
          }),
          factory.build('pub-sub-event', {
            data: {
              itemId: bankConnection.externalId,
              code: PLAID_WEBHOOK_CODE.INITIAL_UPDATE,
            },
          }),
        ]);

        stubPlaid(bankConnection, [bankAccount]);

        // Ensures that when we console.log() the message, it doesn't
        // get caught in a circular reference error.
        message._selfReference = message;
      });

      it('should not err when JSON.stringifying the self-referencing event object', async () => {
        expect(message._selfReference).to.equal(message);

        await processEventWithLock(message, message.data);
      });

      it('should call .ack() when completed', async () => {
        const ackSpy = sinon.spy(message, 'ack');

        await processEventWithLock(message, message.data);

        expect(ackSpy.callCount).to.equal(1);
      });
    });

    context(PLAID_WEBHOOK_CODE.INITIAL_UPDATE, () => {
      const code = PLAID_WEBHOOK_CODE.INITIAL_UPDATE;

      testsForAllCodes(code);

      pastDueSubTest(code);

      newTransactionsTest(code);

      balanceLogTest(code);

      overridesACHMicroDeposit(code);

      fallsbackToGetAccountsOnError(code);

      markIncomeDetectionRequiredTest(code);
    });

    context(PLAID_WEBHOOK_CODE.HISTORICAL_UPDATE, () => {
      const code = PLAID_WEBHOOK_CODE.HISTORICAL_UPDATE;

      it('requests transactions for the last 6 months from plaid', async () => {
        const bankConnection = await factory.create('bank-connection');

        const [bankAccount, message] = await Promise.all([
          factory.create('checking-account', {
            bankConnectionId: bankConnection.id,
            userId: bankConnection.userId,
          }),
          factory.build('pub-sub-event', {
            data: {
              itemId: bankConnection.externalId,
              code,
            },
          }),
        ]);

        const [, getTransactionsSpy] = stubPlaid(bankConnection, [bankAccount]);

        await processEventWithLock(message, message.data);

        sinon.assert.calledWith(
          getTransactionsSpy,
          bankConnection.authToken,
          moment()
            .subtract(6, 'month')
            .format('YYYY-MM-DD'),
          moment()
            .add(2, 'days')
            .format('YYYY-MM-DD'),
        );
      });

      it('sends a historical pull alert if the account age is 60 days or more', async () => {
        const bankConnection = await factory.create('bank-connection', {
          created: moment().subtract(4, 'minutes'),
        });
        const bankAccount = await factory.create('checking-account', {
          bankConnectionId: bankConnection.id,
          userId: bankConnection.userId,
        });

        const user = await bankConnection.getUser();
        await user.update({ defaultBankAccountId: bankAccount.id });
        sandbox
          .stub(BankTransaction, 'bulkInsertAndRetry')
          .callsFake(trans => trans.map((t: any) => upsertBankTransactionForStubs(t)));

        const [, transactionsSpy, , transactionsResponse] = stubPlaid(bankConnection, [
          bankAccount,
        ]);

        const plaidTransactions: plaid.Transaction[] = [
          {
            account_id: bankAccount.externalId,
            account_owner: null,
            amount: 100,
            category: null,
            category_id: 'Grocery',
            date: moment()
              .subtract(60, 'days')
              .format('YYYY-MM-DD'),
            location: {
              address: '123 foo',
              city: 'Los Angeles',
              lat: null,
              lon: null,
              region: 'CA',
              country: 'US',
              store_number: null,
              postal_code: '90213',
            },
            iso_currency_code: null,
            unofficial_currency_code: null,
            name: 'Plaid Transaction 123',
            payment_meta: {
              by_order_of: null,
              payee: 'John Smith',
              payer: null,
              payment_method: null,
              payment_processor: null,
              reference_number: '1234',
              ppd_id: '1234',
              reason: null,
            },
            pending: false,
            pending_transaction_id: null,
            transaction_id: 'test-transaction-id',
            transaction_type: null,
            authorized_date: '',
            merchant_name: '',
            payment_channel: '',
            transaction_code: '',
          },
        ];

        Object.assign(transactionsResponse, {
          total_transactions: 1,
          transactions: plaidTransactions,
        });

        transactionsSpy.resolves(transactionsResponse);

        const message = await factory.build('pub-sub-event', {
          data: {
            itemId: bankConnection.externalId,
            code,
          },
        });

        const alertSpy = sandbox.stub(Notification, 'sendHistorical').resolves();

        await processEventWithLock(message, message.data);

        sinon.assert.calledWith(alertSpy, bankConnection.id);
      });

      it('does not send a historical pull alert for account age is less than 60 days', async () => {
        const bankConnection = await factory.create('bank-connection', {
          created: moment().subtract(4, 'minutes'),
        });

        const [bankAccount, user] = await Promise.all([
          factory.create('checking-account', {
            bankConnectionId: bankConnection.id,
            userId: bankConnection.userId,
          }),
          bankConnection.getUser(),
        ]);

        await user.update({ defaultBankAccountId: bankAccount.id });

        const [, transactionsSpy, , transactionsResponse] = stubPlaid(bankConnection, [
          bankAccount,
        ]);

        const plaidTransactions: plaid.Transaction[] = [
          {
            account_id: bankAccount.externalId,
            account_owner: null,
            amount: 100,
            category: null,
            category_id: 'Grocery',
            date: moment()
              .subtract(59, 'days')
              .format('YYYY-MM-DD'),
            location: {
              address: '123 foo',
              city: 'Los Angeles',
              lat: null,
              lon: null,
              region: 'CA',
              country: 'US',
              store_number: null,
              postal_code: '90213',
            },
            iso_currency_code: null,
            unofficial_currency_code: null,
            name: 'Plaid Transaction 123',
            payment_meta: {
              by_order_of: null,
              payee: 'John Smith',
              payer: null,
              payment_method: null,
              payment_processor: null,
              reference_number: '1234',
              ppd_id: '1234',
              reason: null,
            },
            pending: false,
            pending_transaction_id: null,
            transaction_id: 'test-transaction-id',
            transaction_type: null,
            authorized_date: '',
            merchant_name: '',
            payment_channel: '',
            transaction_code: '',
          },
        ];

        Object.assign(transactionsResponse, {
          total_transactions: 1,
          transactions: plaidTransactions,
        });

        transactionsSpy.resolves(transactionsResponse);

        const message = await factory.build('pub-sub-event', {
          data: {
            itemId: bankConnection.externalId,
            code,
          },
        });

        const alertSpy = sandbox.stub(Notification, 'sendHistorical').resolves();

        await processEventWithLock(message, message.data);

        sinon.assert.notCalled(alertSpy);
      });

      it('does not send a historical pull alert if the connection was added less than 3 minutes ago', async () => {
        const bankConnection = await factory.create('bank-connection', {
          created: moment().subtract(2, 'minutes'),
        });

        const [bankAccount, user] = await Promise.all([
          factory.create('checking-account', {
            bankConnectionId: bankConnection.id,
            userId: bankConnection.userId,
          }),
          bankConnection.getUser(),
        ]);

        await user.update({ defaultBankAccountId: bankAccount.id });

        const [, transactionsSpy, , transactionsResponse] = stubPlaid(bankConnection, [
          bankAccount,
        ]);

        const plaidTransactions: plaid.Transaction[] = [
          {
            account_id: bankAccount.externalId,
            account_owner: null,
            amount: 100,
            category: null,
            category_id: 'Grocery',
            date: moment()
              .subtract(60, 'days')
              .format('YYYY-MM-DD'),
            location: {
              address: '123 foo',
              city: 'Los Angeles',
              lat: null,
              lon: null,
              region: 'CA',
              country: 'US',
              store_number: null,
              postal_code: '90213',
            },
            iso_currency_code: null,
            unofficial_currency_code: null,
            name: 'Plaid Transaction 123',
            payment_meta: {
              by_order_of: null,
              payee: 'John Smith',
              payer: null,
              payment_method: null,
              payment_processor: null,
              reference_number: '1234',
              ppd_id: '1234',
              reason: null,
            },
            pending: false,
            pending_transaction_id: null,
            transaction_id: 'test-transaction-id',
            transaction_type: null,
            authorized_date: '',
            merchant_name: '',
            payment_channel: '',
            transaction_code: '',
          },
        ];

        Object.assign(transactionsResponse, {
          total_transactions: 1,
          transactions: plaidTransactions,
        });

        transactionsSpy.resolves(transactionsResponse);

        const message = await factory.build('pub-sub-event', {
          data: {
            itemId: bankConnection.externalId,
            code,
          },
        });

        const alertSpy = sandbox.stub(Notification, 'sendHistorical').resolves();

        await processEventWithLock(message, message.data);

        sinon.assert.notCalled(alertSpy);
      });

      it('does not send a historical pull alert if user is paused', async () => {
        const getForecastAlertSpy = await sandbox.spy(Notification, 'sendHistorical');
        const user = await factory.create('user', {
          subscriptionStart: null,
        });
        await factory.create('membership-pause', { userId: user.id });
        const bankConnection = await factory.create('bank-connection', {
          userId: user.id,
          created: moment().subtract(4, 'minutes'),
        });
        const [bankAccount, message] = await Promise.all([
          factory.create('checking-account', {
            bankConnectionId: bankConnection.id,
            userId: user.id,
          }),
          factory.build('pub-sub-event', {
            data: {
              itemId: bankConnection.externalId,
              code,
            },
          }),
        ]);
        await user.update({ defaultBankAccountId: bankAccount.id });
        const plaidTransactions: plaid.Transaction[] = [
          {
            account_id: bankAccount.externalId,
            account_owner: null,
            amount: 100,
            category: null,
            category_id: 'Grocery',
            date: moment()
              .subtract(60, 'days')
              .format('YYYY-MM-DD'),
            location: {
              address: '123 foo',
              city: 'Los Angeles',
              lat: null,
              lon: null,
              region: 'CA',
              country: 'USA',
              store_number: null,
              postal_code: '90213',
            },
            iso_currency_code: null,
            unofficial_currency_code: null,
            name: 'Plaid Transaction 123',
            payment_meta: {
              by_order_of: null,
              payee: 'John Smith',
              payer: null,
              payment_method: null,
              payment_processor: null,
              reference_number: '1234',
              ppd_id: '1234',
              reason: null,
            },
            pending: false,
            pending_transaction_id: null,
            transaction_id: 'test-transaction-id',
            transaction_type: null,
            authorized_date: '',
            merchant_name: '',
            payment_channel: '',
            transaction_code: '',
          },
        ];
        const [, transactionsSpy, , transactionsResponse] = stubPlaid(bankConnection, [
          bankAccount,
        ]);

        Object.assign(transactionsResponse, {
          total_transactions: 1,
          transactions: plaidTransactions,
        });

        transactionsSpy.resolves(transactionsResponse);

        await processEventWithLock(message, message.data);

        sinon.assert.notCalled(getForecastAlertSpy);
      });

      it('backfills the daily balance log with 6 weeks of entries', async () => {
        const bankConnection = await factory.create('bank-connection', {
          created: moment().subtract(2, 'minutes'),
        });

        const [bankAccountA, backAccountB, user] = await Promise.all([
          factory.create('checking-account', {
            bankConnectionId: bankConnection.id,
            userId: bankConnection.userId,
          }),
          factory.create('checking-account', {
            bankConnectionId: bankConnection.id,
            userId: bankConnection.userId,
          }),
          bankConnection.getUser(),
        ]);

        await user.update({ defaultBankAccountId: bankAccountA.id });

        stubPlaid(bankConnection, [bankAccountA, backAccountB]);

        const message = await factory.build('pub-sub-event', {
          data: {
            itemId: bankConnection.externalId,
            code,
          },
        });

        await processEventWithLock(message, message.data);

        for (const bankAccount of [bankAccountA, backAccountB]) {
          const logs = await BankingDataClient.getBalanceLogs(bankAccount.id, {
            start: moment().subtract(10, 'years'),
            end: moment(),
          });
          const oldestBalanceLog = logs[0];

          expect(oldestBalanceLog.date).to.be.sameMoment(moment().subtract(6, 'weeks'), 'day');
        }
      });

      it('adds to the stitch accounts queue', async () => {
        const bankConnection = await factory.create('bank-connection', {
          created: moment().subtract(2, 'minutes'),
        });

        const [bankAccount, user] = await Promise.all([
          factory.create('checking-account', {
            bankConnectionId: bankConnection.id,
            userId: bankConnection.userId,
          }),
          bankConnection.getUser(),
        ]);

        await user.update({ defaultBankAccountId: bankAccount.id });

        stubPlaid(bankConnection, [bankAccount]);

        const message = await factory.build('pub-sub-event', {
          data: {
            itemId: bankConnection.externalId,
            code,
          },
        });

        await processEventWithLock(message, message.data);

        expect(stitchOldAccountTransactionsStub.callCount).to.eq(1);
        expect(stitchOldAccountTransactionsStub.firstCall.args[0]).to.deep.eq({
          bankConnectionId: bankConnection.id,
        });
      });

      testsForAllCodes(code);

      pastDueSubTest(code, { shouldEnqueue: false });

      newTransactionsTest(code);

      overridesACHMicroDeposit(code);

      markIncomeDetectionRequiredTest(code);
    });

    context(PLAID_WEBHOOK_CODE.DEFAULT_UPDATE, () => {
      const code = PLAID_WEBHOOK_CODE.DEFAULT_UPDATE;

      testsForAllCodes(code);

      pastDueSubTest(code);

      newTransactionsTest(code);

      balanceLogTest(code);

      overridesACHMicroDeposit(code);

      markIncomeDetectionRequiredTest(code);

      it('updates the account forecast', async () => {
        const bankConnection = await factory.create('bank-connection');

        const [bankAccount, message] = await Promise.all([
          factory.create('checking-account', {
            bankConnectionId: bankConnection.id,
            userId: bankConnection.userId,
          }),
          factory.build('pub-sub-event', {
            data: {
              itemId: bankConnection.externalId,
              code,
            },
          }),
        ]);

        stubPlaid(bankConnection, [bankAccount]);
        const spy = sandbox.spy(Forecast, 'computeAccountForecast');

        await processEventWithLock(message, message.data);

        sinon.assert.called(spy);
      });

      it('should not send forecast alerts if membership is paused', async () => {
        const getForecastAlertSpy = await sandbox.spy(Notification, 'sendForecastAlerts');
        const user = await factory.create('user', {
          subscriptionStart: null,
        });

        await factory.create('membership-pause', { userId: user.id });

        const bankConnection = await factory.create('bank-connection', { userId: user.id });

        const [bankAccount, message] = await Promise.all([
          factory.create('bank-account', {
            bankConnectionId: bankConnection.id,
            userId: user.id,
          }),
          factory.build('pub-sub-event', {
            data: {
              itemId: bankConnection.externalId,
              code,
            },
          }),
        ]);

        stubPlaid(bankConnection, [bankAccount]);

        // Ensures that when we console.log() the message, it doesn't
        // get caught in a circular reference error.
        message._selfReference = message;

        await processEventWithLock(message, message.data);

        sinon.assert.notCalled(getForecastAlertSpy);
      });

      it('should update the account balance', async () => {
        const bankConnection = await factory.create('bank-connection');
        const [bankAccount, message] = await Promise.all([
          factory.create('checking-account', {
            bankConnectionId: bankConnection.id,
            userId: bankConnection.userId,
          }),
          factory.build('pub-sub-event', {
            data: {
              itemId: bankConnection.externalId,
              code,
            },
          }),
        ]);

        stubPlaid(bankConnection, [bankAccount]);
        const upsertBankAccountsSpy = sandbox.spy(BankingDataSync, 'upsertBankAccounts');
        const addAccountAndRoutingSpy = sandbox.spy(BankingDataSync, 'addAccountAndRouting');

        await processEventWithLock(message, message.data);

        sinon.assert.called(upsertBankAccountsSpy);
        sinon.assert.notCalled(addAccountAndRoutingSpy);
      });

      it('should trigger job to score advance approval ml models for primary bank account', async () => {
        const bankConnection = await factory.create<BankConnection>('bank-connection');
        const [bankAccount, message] = await Promise.all([
          factory.create<BankAccount>('checking-account', {
            bankConnectionId: bankConnection.id,
            userId: bankConnection.userId,
          }),
          factory.build('pub-sub-event', {
            data: {
              itemId: bankConnection.externalId,
              code,
            },
          }),
        ]);

        await bankConnection.update({ primaryBankAccountId: bankAccount.id });

        const pubsubPublishStub = sandbox
          .stub(pubsub, 'publish')
          .withArgs(EventTopic.UnderwritingMLScorePreprocess, sinon.match.object);

        stubPlaid(bankConnection, [bankAccount]);

        await processEventWithLock(message, message.data);

        sinon.assert.calledOnce(pubsubPublishStub);
        sinon.assert.calledWith(pubsubPublishStub, EventTopic.UnderwritingMLScorePreprocess, {
          bankAccountId: bankAccount.id,
          trigger: UnderwritingMLScoreEventTrigger.PlaidUpdater,
        });
      });

      it('should not trigger job to score advance approval ml model if code is deleted', async () => {
        const bankConnection = await factory.create<BankConnection>('bank-connection');
        const [bankAccount, message] = await Promise.all([
          factory.create<BankAccount>('checking-account', {
            bankConnectionId: bankConnection.id,
            userId: bankConnection.userId,
          }),
          factory.build('pub-sub-event', {
            data: {
              itemId: bankConnection.externalId,
              code: PLAID_WEBHOOK_CODE.TRANSACTIONS_REMOVED,
            },
          }),
        ]);

        await bankConnection.update({ primaryBankAccountId: bankAccount.id });

        const pubsubPublishStub = sandbox
          .stub(pubsub, 'publish')
          .withArgs(EventTopic.UnderwritingMLScorePreprocess, sinon.match.object);

        stubPlaid(bankConnection, [bankAccount]);

        await processEventWithLock(message, message.data);

        sinon.assert.notCalled(pubsubPublishStub);
      });

      it('Does not query for min bank transaction', async () => {
        const bankConnection = await factory.create('bank-connection');

        const [bankAccount, message] = await Promise.all([
          factory.create('checking-account', {
            bankConnectionId: bankConnection.id,
            userId: bankConnection.userId,
          }),
          factory.build('pub-sub-event', {
            data: {
              itemId: bankConnection.externalId,
              code,
            },
          }),
        ]);

        stubPlaid(bankConnection, [bankAccount]);
        const spy = sandbox.spy(BankTransaction, 'min');

        await processEventWithLock(message, message.data);

        sinon.assert.notCalled(spy);
      });
    });

    context(PLAID_WEBHOOK_CODE.TRANSACTIONS_REMOVED, () => {
      const code = PLAID_WEBHOOK_CODE.TRANSACTIONS_REMOVED;

      testsForAllCodes(code);

      it('deletes the transaction', async () => {
        const bankConnection = await factory.create('bank-connection');
        const bankAccount = await factory.create('checking-account', {
          bankConnectionId: bankConnection.id,
          userId: bankConnection.userId,
        });
        stubPlaid(bankConnection, [bankAccount]);

        const transaction = await factory.create('bank-transaction', {
          bankAccountId: bankAccount.id,
          userId: bankConnection.userId,
          displayName: 'foo',
          transactionDate: moment(),
        });

        const message = await factory.build('pub-sub-event', {
          data: {
            itemId: bankConnection.externalId,
            code,
            removed: [transaction.externalId],
          },
        });

        await processEventWithLock(message, message.data);

        const updatedTransaction = await BankTransaction.findOne({
          where: { externalId: transaction.externalId },
        });

        expect(updatedTransaction).to.equal(null, 'transaction was deleted');
      });

      it('calls lock and wait in throw error mode', async () => {
        const larSpy = sandbox.spy(RedisLock, 'lockAndRun');
        const bankConnection = await factory.create('bank-connection');
        const bankAccount = await factory.create('checking-account', {
          bankConnectionId: bankConnection.id,
          userId: bankConnection.userId,
        });
        stubPlaid(bankConnection, [bankAccount]);

        const transaction = await factory.create('bank-transaction', {
          bankAccountId: bankAccount.id,
          userId: bankConnection.userId,
          displayName: 'foo',
          transactionDate: moment(),
        });

        const message = await factory.build('pub-sub-event', {
          data: {
            itemId: bankConnection.externalId,
            code,
            removed: [transaction.externalId],
          },
        });

        await processEventWithLock(message, message.data);

        expect(larSpy.firstCall.args[2].mode).to.eq(RedisLock.LockMode.WAIT);
      });

      xit('nacks the request if a lock exists', async () => {
        const bankConnection = await factory.create('bank-connection');
        const bankAccount = await factory.create('checking-account', {
          bankConnectionId: bankConnection.id,
          userId: bankConnection.userId,
        });
        stubPlaid(bankConnection, [bankAccount]);

        const transaction = await factory.create('bank-transaction', {
          bankAccountId: bankAccount.id,
          userId: bankConnection.userId,
          displayName: 'foo',
          transactionDate: moment(),
        });

        const message = await factory.build('pub-sub-event', {
          data: {
            itemId: bankConnection.externalId,
            code,
            removed: [transaction.externalId],
          },
        });
        const nackStub = sandbox.stub(message, 'nack');

        await redis.setAsync(
          `bank-connection-updater-lock-${bankConnection.externalId}`,
          moment().toString(),
        );

        await processEventWithLock(message, message.data);

        expect(nackStub.callCount).to.eq(1);
      });

      it('queries with bankAccountId', async () => {
        const bankConnection = await factory.create('bank-connection');
        const bankAccount = await factory.create('checking-account', {
          bankConnectionId: bankConnection.id,
          userId: bankConnection.userId,
        });
        stubPlaid(bankConnection, [bankAccount]);

        const transaction = await factory.create('bank-transaction', {
          bankAccountId: bankAccount.id,
          userId: bankConnection.userId,
          displayName: 'foo',
          transactionDate: moment(),
        });

        const message = await factory.build('pub-sub-event', {
          data: {
            itemId: bankConnection.externalId,
            code,
            removed: [transaction.externalId],
          },
        });

        const spy = sandbox.spy(BankTransaction, 'min');

        await processEventWithLock(message, message.data);

        sinon.assert.called(spy);
        expect(spy.firstCall.args[1]).to.deep.equal({
          where: {
            externalId: [transaction.externalId],
            bankAccountId: [transaction.bankAccountId],
          },
        });
      });
    });
  });

  function testsForAllCodes(currentCode: PLAID_WEBHOOK_CODE) {
    it('marks disconnected connections as reconnected', async () => {
      const bankConnection = await factory.create('bank-connection', {
        hasValidCredentials: false,
      });
      const bankAccount = await factory.create('checking-account', {
        bankConnectionId: bankConnection.id,
        userId: bankConnection.userId,
      });

      stubPlaid(bankConnection, [bankAccount]);

      const message = await factory.build('pub-sub-event', {
        data: {
          itemId: bankConnection.externalId,
          code: currentCode,
        },
      });

      await processEventWithLock(message, message.data);

      await bankConnection.reload();

      expect(bankConnection.hasValidCredentials).to.equal(true);
    });

    it('leaves chase disconnected connections as disconnected', async () => {
      const bankConnection = await factory.create('bank-connection', {
        hasValidCredentials: false,
        institutionId: 3,
      });
      const bankAccount = await factory.create('checking-account', {
        bankConnectionId: bankConnection.id,
        userId: bankConnection.userId,
      });

      stubPlaid(bankConnection, [bankAccount]);

      const message = await factory.build('pub-sub-event', {
        data: {
          itemId: bankConnection.externalId,
          code: currentCode,
        },
      });

      await processEventWithLock(message, message.data);

      await bankConnection.reload();

      expect(bankConnection.hasValidCredentials).to.equal(false);
    });

    it('removes any plaid errors from the bank connection', async () => {
      const bankConnection = await factory.create('bank-connection', {
        bankingDataSourceErrorCode: 'NO_ACCOUNTS',
        bankingDataSourceErrorAt: moment().subtract(1, 'day'),
      });
      const bankAccount = await factory.create('checking-account', {
        bankConnectionId: bankConnection.id,
        userId: bankConnection.userId,
      });

      stubPlaid(bankConnection, [bankAccount]);

      const message = await factory.build('pub-sub-event', {
        data: {
          itemId: bankConnection.externalId,
          code: currentCode,
        },
      });

      await processEventWithLock(message, message.data);

      await bankConnection.reload();

      expect(bankConnection.bankingDataSourceErrorCode).to.equal(null);
      expect(bankConnection.bankingDataSourceErrorAt).to.equal(null);
    });

    it('publishes updated complete event', async () => {
      const bankConnection = await factory.create('bank-connection', { lastPull: moment() });
      const bankAccount = await factory.create('checking-account', {
        bankConnectionId: bankConnection.id,
        userId: bankConnection.userId,
      });
      stubPlaid(bankConnection, [bankAccount]);

      const updateTypeMap = {
        [PLAID_WEBHOOK_CODE.HISTORICAL_UPDATE]: BankConnectionUpdateType.HISTORICAL_UPDATE,
        [PLAID_WEBHOOK_CODE.INITIAL_UPDATE]: BankConnectionUpdateType.INITIAL_UPDATE,
        [PLAID_WEBHOOK_CODE.TRANSACTIONS_REMOVED]: BankConnectionUpdateType.TRANSACTIONS_REMOVED,
        [PLAID_WEBHOOK_CODE.DEFAULT_UPDATE]: BankConnectionUpdateType.DEFAULT_UPDATE,
      };

      const message = await factory.build('pub-sub-event', {
        data: {
          itemId: bankConnection.externalId,
          code: currentCode,
          updateType: updateTypeMap[currentCode],
        },
      });

      await processEventWithLock(message, message.data);

      sandbox.assert.calledWith(updateCompletedStub, {
        bankConnectionId: bankConnection.id,
        userId: bankConnection.userId,
        bankAccountIds: [bankAccount.id],
        updateType: message.data.updateType,
        connection: {
          authToken: bankConnection.authToken,
          externalId: bankConnection.externalId,
          mxUserId: null,
          userId: bankConnection.userId,
          bankingDataSource: bankConnection.bankingDataSource,
          lastPull: bankConnection.lastPull.format(),
        },
        bankAccounts: [{ id: bankAccount.id.toString(), externalId: bankAccount.externalId }],
        options: {
          historical: currentCode === PLAID_WEBHOOK_CODE.HISTORICAL_UPDATE,
          source: 'plaid-updater',
          initialPull: currentCode === PLAID_WEBHOOK_CODE.INITIAL_UPDATE,
          removed: [],
        },
      });
    });
  }

  function stubPlaid(
    bankConnection: BankConnection,
    bankAccounts: BankAccount[],
  ): [sinon.SinonStub, sinon.SinonStub, sinon.SinonStub, AccountsResponse, TransactionsResponse] {
    const item: Item = {
      available_products: [],
      billed_products: [],
      error: null,
      institution_id: 'foo',
      item_id: bankConnection.externalId,
      webhook: 'bar',
      consent_expiration_time: '',
    };

    const accountsResponse: any = {
      request_id: 'foo',
      item,
      numbers: { ach: [] },
      accounts: bankAccounts.map(bankAccount => ({
        account_id: bankAccount.externalId,
        balances: {
          current: 100,
          available: 200,
          limit: null,
        },
        mask: '1111',
        name: 'Plaid Account',
        official_name: null,
        type: bankAccount.type,
        subtype: bankAccount.subtype,
      })),
    };

    const transactionsResponse: TransactionsResponse = {
      request_id: 'foo',
      accounts: accountsResponse.accounts,
      total_transactions: bankAccounts.length,
      transactions: bankAccounts.map((bankAccount, index) => ({
        account_id: bankAccount.externalId,
        account_owner: null,
        amount: 100,
        category: null,
        category_id: 'Grocery',
        date: '2017-05-01',
        location: {
          address: '123 foo',
          city: 'Los Angeles',
          lat: null,
          lon: null,
          region: 'CA',
          country: 'USA',
          store_number: null,
          postal_code: '90213',
        },
        iso_currency_code: null,
        unofficial_currency_code: null,
        name: 'Plaid Transaction 123',
        payment_meta: {
          by_order_of: null,
          payee: 'John Smith',
          payer: null,
          payment_method: null,
          payment_processor: null,
          reference_number: '1234',
          ppd_id: '1234',
          reason: null,
        },
        pending: false,
        pending_transaction_id: null,
        transaction_id: `1-${index}`,
        transaction_type: null,
        authorized_date: '',
        merchant_name: '',
        payment_channel: '',
        transaction_code: '',
      })),
      item,
    };

    const accountsSpy = sandbox.stub(plaidClient, 'getAccounts').resolves(accountsResponse);
    const authSpy = sandbox.stub(plaidClient, 'getAuth').resolves(accountsResponse);
    const transactionsSpy = sandbox
      .stub(plaidClient, 'getTransactions')
      .resolves(transactionsResponse);

    return [accountsSpy, transactionsSpy, authSpy, accountsResponse, transactionsResponse];
  }

  function overridesACHMicroDeposit(currentCode: PLAID_WEBHOOK_CODE) {
    it('should override ach micro deposit when auth is available', async () => {
      const bankConnection = await factory.create('bank-connection');
      const bankAccount: BankAccount = await factory.create('checking-account', {
        bankConnectionId: bankConnection.id,
        userId: bankConnection.userId,
        accountNumber: 'imaginary',
        accountNumberAes256: 'fantastic',
        microDeposit: 'REQUIRED',
        microDepositCreated: '2019-01-01 00:00:00',
        institutionId: bankConnection.institutionId,
      });

      const deleteSynapsePayNodeStub = sandbox
        .stub(SynapsepayNodeLib, 'deleteSynapsePayNode')
        .resolves();

      const [accountsSpy, , , accountsResponse] = stubPlaid(bankConnection, [bankAccount]);

      Object.assign(accountsResponse, {
        numbers: {
          ach: [
            {
              account_id: accountsResponse.accounts[0].account_id,
              account: 'mam',
              routing: 'moth',
            },
          ],
        },
      });

      accountsSpy.resolves(accountsResponse);

      const [institution, message] = await Promise.all([
        bankAccount.getInstitution(),
        factory.build('pub-sub-event', {
          data: {
            itemId: bankConnection.externalId,
            code: currentCode,
          },
        }),
      ]);

      await processEventWithLock(message, message.data);

      const [bankAccountReloaded, auditLogs] = await Promise.all([
        BankAccount.findByPk(bankAccount.id),
        AuditLog.findAll(),
      ]);

      expect(deleteSynapsePayNodeStub.callCount).to.equal(1);
      expect(bankAccountReloaded.microDeposit).to.equal(null);
      expect(bankAccountReloaded.microDepositCreated).to.equal(null);
      expect(bankAccountReloaded.accountNumber).to.not.equal('imaginary');
      expect(bankAccountReloaded.accountNumber).to.not.equal(null);
      expect(bankAccountReloaded.accountNumberAes256).to.not.equal('fantastic');
      expect(bankAccountReloaded.accountNumberAes256).to.not.equal(null);

      expect(auditLogs).to.have.lengthOf(2);
      const auditLog = auditLogs[1];
      expect(auditLog.type).to.equal('ACH_MICRO_DEPOSIT_OVERRIDDEN');
      expect(auditLog.eventUuid).to.equal(bankAccount.externalId);
      expect(auditLog.extra.bankAccountId).to.equal(bankAccount.id);
      expect(auditLog.extra.institutionName).to.equal(institution.displayName);
      expect(auditLog.extra.plaidInstitutionId).to.equal(institution.plaidInstitutionId);
    });

    it('should not nack message if pulling auth fails with internal server error', async () => {
      const bankConnection = await factory.create('bank-connection');

      const [bankAccount, message] = await Promise.all([
        factory.create('checking-account', {
          bankConnectionId: bankConnection.id,
          userId: bankConnection.userId,
          accountNumber: 'imaginary',
          accountNumberAes256: 'fantastic',
          microDeposit: 'REQUIRED',
          microDepositCreated: '2019-01-01 00:00:00',
          institutionId: bankConnection.institutionId,
        }),
        factory.build('pub-sub-event', {
          data: {
            itemId: bankConnection.externalId,
            code: currentCode,
          },
        }),
      ]);

      const [accountsSpy, , authSpy, accountsResponse] = stubPlaid(bankConnection, [bankAccount]);
      authSpy.rejects(
        new BankingDataSourceError(
          'im an error',
          BankingDataSource.Plaid,
          PlaidErrorCode.InternalServerError,
          BankingDataSourceErrorType.InternalServerError,
          {},
        ),
      );
      Object.assign(accountsResponse, {
        numbers: {
          ach: [
            {
              account_id: accountsResponse.accounts[0].account_id,
              account: 'mam',
              routing: 'moth',
            },
          ],
        },
      });
      accountsSpy.resolves(accountsResponse);

      message.nack = sandbox.stub();

      await processEventWithLock(message, message.data);

      expect(message.nack.callCount).to.eq(0);
    });
  }

  function fallsbackToGetAccountsOnError(currentCode: PLAID_WEBHOOK_CODE) {
    it('should fallback to get accounts if auth errors', async () => {
      const bankConnection = await factory.create('bank-connection');
      const bankAccount: BankAccount = await factory.create('checking-account', {
        bankConnectionId: bankConnection.id,
        userId: bankConnection.userId,
        accountNumber: 'imaginary',
        accountNumberAes256: 'fantastic',
        microDeposit: 'REQUIRED',
        microDepositCreated: '2019-01-01 00:00:00',
      });

      const [accountsSpy, , authSpy] = stubPlaid(bankConnection, [bankAccount]);

      authSpy.rejects('Wow i love bacon');

      const message = await factory.build('pub-sub-event', {
        data: {
          itemId: bankConnection.externalId,
          code: currentCode,
        },
      });

      await processEventWithLock(message, message.data);
      expect(accountsSpy.callCount).to.equal(1);
    });
  }

  function pastDueSubTest(currentCode: PLAID_WEBHOOK_CODE, { shouldEnqueue = true } = {}) {
    it('enqueus a past due subscription collection job', async () => {
      const bankConnection = await factory.create('bank-connection');
      const [bankAccount, message] = await Promise.all([
        factory.create('checking-account', {
          bankConnectionId: bankConnection.id,
          userId: bankConnection.userId,
        }),
        factory.build('pub-sub-event', {
          data: {
            itemId: bankConnection.externalId,
            code: currentCode,
          },
        }),
      ]);

      const pastDueStub = sandbox.stub(Jobs, 'collectPastDueSubscriptionTask');

      stubPlaid(bankConnection, [bankAccount]);

      await processEventWithLock(message, message.data);

      if (shouldEnqueue) {
        expect(pastDueStub.callCount).to.eq(1);
        const [job] = pastDueStub.firstCall.args;
        expect(job.userId).to.deep.equal(bankConnection.userId);
        expect(job.trigger).to.deep.equal('bank-account-update');
      } else {
        expect(pastDueStub.callCount).to.eq(0);
      }
    });
  }

  function newTransactionsTest(currentCode: PLAID_WEBHOOK_CODE) {
    it('saves new transactions', async () => {
      const bankConnection = await factory.create('bank-connection');
      const [bankAccount, message] = await Promise.all([
        factory.create('checking-account', {
          bankConnectionId: bankConnection.id,
          userId: bankConnection.userId,
        }),
        factory.build('pub-sub-event', {
          data: {
            itemId: bankConnection.externalId,
            code: currentCode,
          },
        }),
      ]);

      const [, transactionsSpy, , transactionsResponse] = stubPlaid(bankConnection, [bankAccount]);

      const plaidTransactions: plaid.Transaction[] = [
        {
          account_id: bankAccount.externalId,
          account_owner: null,
          amount: 100,
          category: null,
          category_id: 'Grocery',
          date: moment()
            .subtract(2, 'days')
            .format('YYYY-MM-DD'),
          location: {
            address: '123 foo',
            city: 'Los Angeles',
            lat: null,
            lon: null,
            region: 'CA',
            country: 'US',
            store_number: null,
            postal_code: '90213',
          },
          iso_currency_code: null,
          unofficial_currency_code: null,
          name: 'Plaid Transaction 123',
          payment_meta: {
            by_order_of: null,
            payee: 'John Smith',
            payer: null,
            payment_method: null,
            payment_processor: null,
            reference_number: '1234',
            ppd_id: '1234',
            reason: null,
          },
          pending: false,
          pending_transaction_id: null,
          transaction_id: 'test-transaction-id',
          transaction_type: null,
          authorized_date: '',
          merchant_name: '',
          payment_channel: '',
          transaction_code: '',
        },
      ];

      Object.assign(transactionsResponse, {
        total_transactions: 1,
        transactions: plaidTransactions,
      });

      transactionsSpy.resolves(transactionsResponse);

      await processEventWithLock(message, message.data);

      const transactions = await BankTransaction.getByBankAccountId(bankAccount.id);

      expect(transactions.length).to.equal(1);
      expect(transactions[0].amount).to.equal(-100);
      expect(transactions[0].externalId).to.equal('test-transaction-id');
    });
  }

  function balanceLogTest(code: PLAID_WEBHOOK_CODE) {
    it('creates a balance log entry for the current date', async () => {
      const bankConnection = await factory.create('bank-connection', { lastPull: moment() });

      const [bankAccount, message] = await Promise.all([
        factory.create('checking-account', {
          bankConnectionId: bankConnection.id,
          userId: bankConnection.userId,
        }),
        factory.build('pub-sub-event', {
          data: {
            itemId: bankConnection.externalId,
            code,
          },
        }),
      ]);

      const [, , , accountsResponse] = stubPlaid(bankConnection, [bankAccount]);

      await processEventWithLock(message, message.data);

      const logs = await BankingDataClient.getBalanceLogs(bankAccount.id, {
        start: moment().startOf('day'),
        end: moment().endOf('day'),
      });
      const balanceLog = logs[0];

      const {
        balances: { available, current },
      } = accountsResponse.accounts.find(a => a.account_id === bankAccount.externalId);

      expect(balanceLog.available).to.equal(available);
      expect(balanceLog.current).to.equal(current);
    });
  }

  function markIncomeDetectionRequiredTest(code: PLAID_WEBHOOK_CODE) {
    it('marks initial income detection required for initial pull', async () => {
      const bankConnection = await factory.create('bank-connection', {
        hasValidCredentials: false,
      });
      const bankAccount0 = await factory.create('checking-account', {
        bankConnectionId: bankConnection.id,
        userId: bankConnection.userId,
      });
      const bankAccount1 = await factory.create('savings-account', {
        bankConnectionId: bankConnection.id,
        userId: bankConnection.userId,
      });

      stubPlaid(bankConnection, [bankAccount0, bankAccount1]);

      const message = await factory.build('pub-sub-event', {
        data: {
          itemId: bankConnection.externalId,
          code,
        },
      });

      await processEventWithLock(message, message.data);

      const expectedDetectionsRequired = code === PLAID_WEBHOOK_CODE.INITIAL_UPDATE ? 2 : 0;
      expect(markInitialDetectionStub.callCount).to.equal(expectedDetectionsRequired);
    });
  }
});
