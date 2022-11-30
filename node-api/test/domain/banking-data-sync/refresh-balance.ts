import { BankingDataSource } from '@dave-inc/wire-typings';
import { expect } from 'chai';
import * as sinon from 'sinon';
import BankOfDaveInternalApiIntegration from '../../../src/domain/banking-data-source/bank-of-dave-internal/integration';
import * as BankingDataSync from '../../../src/domain/banking-data-sync';
import { BankDataSourceRefreshError } from '../../../src/lib/error';
import Plaid from '../../../src/lib/plaid';
import { BalanceCheck, BankAccount } from '../../../src/models';
import { BankConnectionUpdate } from '../../../src/models/warehouse';
import { BalanceCheckTrigger, BalanceLogCaller, PlaidErrorCode } from '../../../src/typings';
import factory from '../../factories';
import { clean, replayHttp, up } from '../../test-helpers';
import stubBankTransactionClient from '../../test-helpers/stub-bank-transaction-client';

describe('BankAccount', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());
  beforeEach(async () => {
    stubBankTransactionClient(sandbox);
    await up();
  });
  afterEach(() => clean(sandbox));

  describe('.refreshBalance', () => {
    let account: BankAccount;

    context('Plaid', () => {
      beforeEach(async () => {
        const token = 'access-sandbox-6ec54ddc-28a3-4d68-b4dd-14593d1bb770';
        const externalId = '1n64o3b71BCLjKXeJ5BNi8xqwX8jqxF5w98qx';
        const { id: userId } = await factory.create('user');
        const { id: bankConnectionId } = await factory.create('bank-connection', {
          userId,
          authToken: token,
          bankingDataSource: 'PLAID',
        });

        account = await factory.create('bank-account', {
          userId,
          bankConnectionId,
          externalId,
        });
      });

      afterEach(() => {
        return clean();
      });

      const fixture = 'plaid/getBalance-other-token-success.json';
      const balances = { available: 100, current: 110 };

      it(
        'updates the record',
        replayHttp(fixture, async () => {
          await BankingDataSync.refreshBalance(account, { caller: BalanceLogCaller.UserRefresh }); //all callers randomly chosen from among callers that actually call this in production
          await account.reload();

          expect(account.available).to.equal(balances.available);
          expect(account.current).to.equal(balances.current);
        }),
      );

      it(
        'logs the balance check',
        replayHttp(fixture, async () => {
          await BankingDataSync.refreshBalance(account, {
            caller: BalanceLogCaller.SubscriptionCollectionJob,
          });

          const log = await BalanceCheck.findOne({
            where: { bankConnectionId: account.bankConnectionId },
            order: [['created', 'DESC']],
          });

          expect(log.extra.balances.available).to.equal(balances.available);
          expect(log.extra.balances.current).to.equal(balances.current);
          expect(log.responseTime).to.be.at.least(0);
        }),
      );

      it(
        'accepts a reason for the check',
        replayHttp(fixture, async () => {
          await BankingDataSync.refreshBalance(account, {
            reason: BalanceCheckTrigger.ADVANCE_COLLECTION,
            caller: BalanceLogCaller.DailyScheduledTineyMoneyHardPullAutoRetrieveJob,
          });

          const log = await BalanceCheck.findOne({
            where: {
              bankConnectionId: account.bankConnectionId,
              trigger: BalanceCheckTrigger.ADVANCE_COLLECTION,
            },
            order: [['created', 'DESC']],
          });
          expect(log.trigger).to.equal(BalanceCheckTrigger.ADVANCE_COLLECTION);
        }),
      );

      it(
        'accepts an advance id',
        replayHttp(fixture, async () => {
          await BankingDataSync.refreshBalance(account, {
            advanceId: 5,
            caller: BalanceLogCaller.DailyScheduledAutoRetrieveJob,
          });

          const log = await BalanceCheck.findOne({
            where: {
              bankConnectionId: account.bankConnectionId,
              advanceId: 5,
            },
            order: [['created', 'DESC']],
          });
          expect(log.advanceId).to.equal(5);
        }),
      );

      it(
        'returns the balances',
        replayHttp(fixture, async () => {
          const bals = await BankingDataSync.refreshBalance(account, {
            caller: BalanceLogCaller.DailyAutoRetrieveJob,
          });

          expect(bals.available).to.equal(balances.available);
          expect(bals.current).to.equal(balances.current);
        }),
      );

      it(
        'logs a reconnect if the connection was marked as invalid',
        replayHttp(fixture, async () => {
          const createSpy = sandbox.spy(BankConnectionUpdate, 'create');
          const connection = await account.getBankConnection();
          await connection.update({ hasValidCredentials: false });
          await BankingDataSync.refreshBalance(account, {
            caller: BalanceLogCaller.DebitCardMicroDepositStep1,
          });
          expect(createSpy.callCount).to.eq(1);
          expect(createSpy.firstCall.args[0].type).to.eq('BANK_CONNECTION_RECONNECTED');
          expect(createSpy.firstCall.args[0].extra.type).to.equal('balance-check');
        }),
      );

      it(
        'handles soft deleted bank connections',
        replayHttp(fixture, async () => {
          const connection = await account.getBankConnection();

          await connection.destroy();

          const bals = await BankingDataSync.refreshBalance(account, {
            caller: BalanceLogCaller.DebitCardMicroDepositStep2,
          });

          expect(bals.available).to.equal(balances.available);
          expect(bals.current).to.equal(balances.current);
        }),
      );
    });

    context('Bank Of Dave', () => {
      const balances = { available: 0.1, current: 0.1 };

      beforeEach(async () => {
        const token = '1783460';
        const externalId = '0b39346b-9b00-4aee-a11e-0428fd13df81';
        const { id: userId } = await factory.create('user');
        const { id: bankConnectionId } = await factory.create('bank-connection', {
          userId,
          authToken: token,
          bankingDataSource: 'BANK_OF_DAVE',
        });

        account = await factory.create('bank-account', {
          userId,
          bankConnectionId,
          externalId,
        });

        sandbox.stub(BankOfDaveInternalApiIntegration.prototype, 'getBalance').resolves([
          {
            bankingDataSource: BankingDataSource.BankOfDave,
            externalId,
            available: balances.available,
            current: balances.current,
          },
        ]);

        sandbox.stub(BankOfDaveInternalApiIntegration.prototype, 'getAccounts').resolves([
          {
            bankingDataSource: BankingDataSource.BankOfDave,
            externalId,
            available: balances.available,
            current: balances.current,
          },
        ]);
      });

      afterEach(() => {
        return clean();
      });

      it('updates the record', async () => {
        await BankingDataSync.refreshBalance(account, {
          caller: BalanceLogCaller.DebitCardMicroDepositStep3,
        });
        await account.reload();

        expect(account.available).to.equal(balances.available);
        expect(account.current).to.equal(balances.current);
      });

      it('logs the balance check', async () => {
        await BankingDataSync.refreshBalance(account, { caller: BalanceLogCaller.UserRefresh });

        const log = await BalanceCheck.findOne({
          where: { bankConnectionId: account.bankConnectionId },
          order: [['created', 'DESC']],
        });

        expect(log.extra.balances.available).to.equal(balances.available);
        expect(log.extra.balances.current).to.equal(balances.current);
        expect(log.responseTime).to.be.at.least(0);
      });

      it('accepts a reason for the check', async () => {
        await BankingDataSync.refreshBalance(account, {
          reason: BalanceCheckTrigger.ADVANCE_COLLECTION,
          caller: BalanceLogCaller.SubscriptionCollectionJob,
        });

        const log = await BalanceCheck.findOne({
          where: {
            bankConnectionId: account.bankConnectionId,
            trigger: BalanceCheckTrigger.ADVANCE_COLLECTION,
          },
          order: [['created', 'DESC']],
        });
        expect(log.trigger).to.equal(BalanceCheckTrigger.ADVANCE_COLLECTION);
      });

      it('accepts an advance id', async () => {
        await BankingDataSync.refreshBalance(account, {
          advanceId: 5,
          caller: BalanceLogCaller.DailyAutoRetrieveJob,
        });

        const log = await BalanceCheck.findOne({
          where: {
            bankConnectionId: account.bankConnectionId,
            advanceId: 5,
          },
          order: [['created', 'DESC']],
        });
        expect(log.advanceId).to.equal(5);
      });

      it('returns the balances', async () => {
        const bals = await BankingDataSync.refreshBalance(account, {
          caller: BalanceLogCaller.DailyScheduledAutoRetrieveJob,
        });

        expect(bals.available).to.equal(balances.available);
        expect(bals.current).to.equal(balances.current);
      });

      it('logs a reconnect if the connection was marked as invalid', async () => {
        const createSpy = sandbox.spy(BankConnectionUpdate, 'create');
        const connection = await account.getBankConnection();
        await connection.update({ hasValidCredentials: false });
        await BankingDataSync.refreshBalance(account, {
          caller: BalanceLogCaller.DailyScheduledTineyMoneyHardPullAutoRetrieveJob,
        });

        expect(createSpy.callCount).to.eq(1);
        expect(createSpy.firstCall.args[0].type).to.eq('BANK_CONNECTION_RECONNECTED');
        expect(createSpy.firstCall.args[0].extra.type).to.equal('balance-check');
      });

      it('handles soft deleted bank connections', async () => {
        const connection = await account.getBankConnection();

        await connection.destroy();

        const bals = await BankingDataSync.refreshBalance(account, {
          caller: BalanceLogCaller.DebitCardMicroDepositStep1,
        });

        expect(bals.available).to.equal(balances.available);
        expect(bals.current).to.equal(balances.current);
      });
    });

    context('Plaid tests with specific stubbin', () => {
      beforeEach(async () => {
        account = await BankAccount.findByPk(2);
      });

      it('handles NULL available balance', async () => {
        sandbox.restore();
        sandbox.stub(Plaid, 'getBalance').resolves({
          accounts: [
            {
              account_id: account.externalId,
              subtype: 'checking',
              type: 'depository',
              balances: {
                available: null,
                current: 100,
                limit: null,
              },
            },
          ],
        });

        const balances = await BankingDataSync.refreshBalance(account, {
          caller: BalanceLogCaller.DebitCardMicroDepositStep2,
        });

        expect(balances.available).to.equal(null);
        expect(balances.current).to.equal(100);
      });

      it('logs a PlaidResponseError when the plaid response does not contain the account', async () => {
        const plaidResponse: any = {
          accounts: [
            {
              account_id: 'wrong-account',
              balances: {
                available: 100,
                current: 100,
                limit: null,
              },
            },
          ],
        };

        sandbox.stub(Plaid, 'getBalance').resolves(plaidResponse);

        await expect(
          BankingDataSync.refreshBalance(account, { caller: BalanceLogCaller.UserRefresh }),
        ).to.be.rejectedWith(BankDataSourceRefreshError, 'Response does not contain bank account');
      });

      context('When plaid returns an error', () => {
        it('calls handleDisconnect on the bankConnection helper', async () => {
          sandbox.stub(Plaid, 'getBalance').rejects({
            error_type: 'ITEM_ERROR',
            error_code: PlaidErrorCode.ItemLoginRequired,
          });

          const connection = await account.getBankConnection();

          const stub = sandbox.stub(BankingDataSync, 'handleDisconnect').resolves();
          await expect(
            BankingDataSync.refreshBalance(account, { caller: BalanceLogCaller.UserRefresh }),
          ).to.be.rejected;

          sinon.assert.calledWith(stub, connection);
        });

        it('logs the error code', async () => {
          sandbox.stub(Plaid, 'getBalance').rejects({
            error_type: 'API_ERROR',
            error_code: 'INTERNAL_SERVER_ERROR',
          });

          await expect(
            BankingDataSync.refreshBalance(account, {
              caller: BalanceLogCaller.DebitCardMicroDepositStep3,
            }),
          ).to.be.rejected;

          const log = await BalanceCheck.findOne({
            where: { bankConnectionId: account.bankConnectionId },
          });
          expect(log.successful).to.equal(false);
          expect(log.extra.err.errorCode).to.equal(PlaidErrorCode.InternalServerError);
        });
      });
    });
  });
});
