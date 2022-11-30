import { expect } from 'chai';
import * as sinon from 'sinon';
import * as request from 'supertest';
import BankOfDaveInternalApiIntegration from '../../../src/domain/banking-data-source/bank-of-dave-internal/integration';
import * as BankingDataSync from '../../../src/domain/banking-data-sync';
import logger from '../../../src/lib/logger';
import Plaid from '../../../src/lib/plaid';
import * as redis from '../../../src/lib/redis';
import { BalanceCheck, BankAccount } from '../../../src/models';
import { BankConnectionUpdate } from '../../../src/models/warehouse';
import app, { BASE_SERVICE_PATH } from '../../../src/services/aether';
import { BalanceCheckTrigger, PlaidErrorCode } from '../../../src/typings';
import factory from '../../factories';
import { clean, replayHttp, stubBankTransactionClient, up } from '../../test-helpers';

function getEndpoint(bankAccountId: number, advanceId: number): string {
  return `${BASE_SERVICE_PATH}/bank-account/${bankAccountId}/advance/${advanceId}/refresh-balance`;
}

describe('Aether Balance Refresh', () => {
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
          await request(app)
            .post(getEndpoint(account.id, 5))
            .send({ useCache: false }); //all callers randomly chosen from among callers that actually call this in production
          await account.reload();

          expect(account.available).to.equal(balances.available);
          expect(account.current).to.equal(balances.current);
        }),
      );

      it(
        'logs the balance check',
        replayHttp(fixture, async () => {
          await request(app)
            .post(getEndpoint(account.id, 5))
            .send({ useCache: false });

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
          await request(app)
            .post(getEndpoint(account.id, 5))
            .send({ useCache: false });

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
          await request(app)
            .post(getEndpoint(account.id, 5))
            .send({ useCache: false });

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
          const response = await request(app)
            .post(getEndpoint(account.id, 5))
            .send({ useCache: false });
          const { balances: bals } = response.body;

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

          await request(app)
            .post(getEndpoint(account.id, 5))
            .send({ useCache: false });
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

          const response = await request(app)
            .post(getEndpoint(account.id, 5))
            .send({ useCache: false });
          const { balances: bals } = response.body;

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
        const accountResponses = [{ externalId, available: 0.1, current: 0.1 }];
        sandbox
          .stub(BankOfDaveInternalApiIntegration.prototype, 'getBalance')
          .resolves(accountResponses);
      });

      afterEach(() => {
        return clean();
      });

      it('updates the record', async () => {
        await request(app)
          .post(getEndpoint(account.id, 5))
          .send({ useCache: false });

        await account.reload();

        expect(account.available).to.equal(balances.available);
        expect(account.current).to.equal(balances.current);
      });

      it('logs the balance check', async () => {
        await request(app)
          .post(getEndpoint(account.id, 5))
          .send({ useCache: false });

        const log = await BalanceCheck.findOne({
          where: { bankConnectionId: account.bankConnectionId },
          order: [['created', 'DESC']],
        });

        expect(log.extra.balances.available).to.equal(balances.available);
        expect(log.extra.balances.current).to.equal(balances.current);
        expect(log.responseTime).to.be.at.least(0);
      });

      it('accepts a reason for the check', async () => {
        await request(app)
          .post(getEndpoint(account.id, 5))
          .send({ useCache: false });

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
        await request(app)
          .post(getEndpoint(account.id, 5))
          .send({ useCache: false });

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
        const response = await request(app)
          .post(getEndpoint(account.id, 5))
          .send({ useCache: false });
        const { balances: bals } = response.body;

        expect(bals.available).to.equal(balances.available);
        expect(bals.current).to.equal(balances.current);
      });

      it('logs a reconnect if the connection was marked as invalid', async () => {
        const createSpy = sandbox.spy(BankConnectionUpdate, 'create');
        const connection = await account.getBankConnection();
        await connection.update({ hasValidCredentials: false });

        await request(app)
          .post(getEndpoint(account.id, 5))
          .send({ useCache: false });

        expect(createSpy.callCount).to.eq(1);
        expect(createSpy.firstCall.args[0].type).to.eq('BANK_CONNECTION_RECONNECTED');
        expect(createSpy.firstCall.args[0].extra.type).to.equal('balance-check');
      });

      it('handles soft deleted bank connections', async () => {
        const connection = await account.getBankConnection();

        await connection.destroy();

        const response = await request(app)
          .post(getEndpoint(account.id, 5))
          .send({ useCache: false });
        const { balances: bals } = response.body;

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

        const response = await request(app)
          .post(getEndpoint(account.id, 5))
          .send({ useCache: false });
        const { balances: bals } = response.body;

        expect(bals.available).to.equal(null);
        expect(bals.current).to.equal(100);
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
        sandbox.stub(redis, 'setNxEx').resolves(true);
        const loggerSpy = sandbox.stub(logger, 'error');

        const response = await request(app)
          .post(getEndpoint(account.id, 5))
          .send({ useCache: false });
        expect(response.status).to.equal(500);

        const logMetaData = loggerSpy.firstCall.args[1];
        expect(logMetaData.error.message).to.equal('Response does not contain bank account');
      });

      context('When plaid returns an error', () => {
        it('calls handleDisconnect on the bankConnection helper', async () => {
          sandbox.stub(Plaid, 'getBalance').rejects({
            error_type: 'ITEM_ERROR',
            error_code: PlaidErrorCode.ItemLoginRequired,
          });

          const connection = await account.getBankConnection();

          const stub = sandbox.stub(BankingDataSync, 'handleDisconnect').resolves();
          sandbox.stub(redis, 'setNxEx').resolves(true);

          const response = await request(app)
            .post(getEndpoint(account.id, 5))
            .send({ useCache: false });
          expect(response.status).to.equal(500);

          sinon.assert.calledWith(stub, connection);
        });

        it('logs the error code', async () => {
          sandbox.stub(Plaid, 'getBalance').rejects({
            error_type: 'API_ERROR',
            error_code: 'INTERNAL_SERVER_ERROR',
            error_message: 'an unexpected error occurred',
          });
          sandbox.stub(redis, 'setNxEx').resolves(true);

          const response = await request(app)
            .post(getEndpoint(account.id, 5))
            .send({ useCache: false });
          expect(response.status).to.equal(500);
          expect(response.body.reason).to.equal('Bank refresh source threw internal server error');

          const log = await BalanceCheck.findOne({
            where: { bankConnectionId: account.bankConnectionId },
          });
          expect(log.successful).to.equal(false);
          expect(log.extra.err.errorCode).to.equal(PlaidErrorCode.InternalServerError);
        });

        it('logs the error code for institution not found', async () => {
          sandbox.stub(Plaid, 'getBalance').rejects({
            error_type: 'INSTITUTION_ERROR',
            error_code: 'INSTITUTION_NOT_RESPONDING',
            error_message: 'this institution is not currently responding to this request.',
          });
          sandbox.stub(redis, 'setNxEx').resolves(true);

          const response = await request(app)
            .post(getEndpoint(account.id, 5))
            .send({ useCache: false });
          expect(response.status).to.equal(502);
          expect(response.body.reason).to.equal('Institution not responding');

          const log = await BalanceCheck.findOne({
            where: { bankConnectionId: account.bankConnectionId },
          });
          expect(log.successful).to.equal(false);
          expect(log.extra.err.errorCode).to.equal(PlaidErrorCode.InstitutionNotResponding);
        });
      });
    });
  });
});
