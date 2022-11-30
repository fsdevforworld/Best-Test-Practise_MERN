import { BankAccountSubtype, BankAccountType } from '@dave-inc/wire-typings';
import { expect } from 'chai';
import * as faker from 'faker';
import * as request from 'supertest';
import app from '../../../../src/api';
import BankOfDaveInternalApiIntegration from '../../../../src/domain/banking-data-source/bank-of-dave-internal/integration';
import PlaidIntegration from '../../../../src/domain/banking-data-source/plaid/integration';
import * as BankingDataSync from '../../../../src/domain/banking-data-sync';
import * as RecurringTransactionJobs from '../../../../src/domain/recurring-transaction/jobs';
import { CUSTOM_ERROR_CODES } from '../../../../src/lib/error';
import { moment } from '@dave-inc/time-lib';
import * as sinon from 'sinon';
import 'sinon-chai';
import plaidClient from '../../../../src/lib/plaid';
import { BalanceCheck, BankAccount, User, BankConnection } from '../../../../src/models';
import { BalanceCheckTrigger, PlaidErrorCode, PlaidErrorTypes } from '../../../../src/typings';
import factory from '../../../factories';
import { clean, replayHttp } from '../../../test-helpers';
import BankingDataClient from '../../../../src/lib/heath-client';
import stubBankTransactionClient from '../../../test-helpers/stub-bank-transaction-client';
import * as Jobs from '../../../../src/jobs/data';

describe('GET /bank_account/:bankAccountId/refresh', () => {
  const sandbox = sinon.createSandbox();
  let bankAccount: BankAccount;
  let accountsStub: sinon.SinonStub;
  let syncTransactionStub: sinon.SinonStub;
  let bankConnection: BankConnection;

  type PlaidTestCase = {
    expectedCustomCode: number;
    plaidErrorCode: PlaidErrorCode;
    plaidErrorType: string;
  };

  afterEach(() => clean(sandbox));

  beforeEach(() => {
    stubBankTransactionClient(sandbox);
    syncTransactionStub = sandbox.stub(BankingDataSync, 'fetchAndSyncBankTransactions');
    sandbox.stub(RecurringTransactionJobs, 'createUpdateExpectedTransactionsTask');
    sandbox.stub(Jobs, 'createBroadcastBankDisconnectTask');
  });

  context('Plaid', () => {
    beforeEach(async () => {
      const token = 'access-sandbox-1fbf327f-6bf1-423d-b966-425d420d0fa2';
      const externalId = 'Z5qdlz6kPgFDRx1RzD6MuLdW6PxjKACg6JwQm';
      const { id: userId } = await factory.create('user');
      bankConnection = await factory.create('bank-connection', {
        userId,
        authToken: token,
        bankingDataSource: 'PLAID',
      });
      const { id: bankConnectionId } = bankConnection;

      bankAccount = await factory.create('bank-account', {
        userId,
        bankConnectionId,
        externalId,
      });
      accountsStub = sandbox.stub(plaidClient, 'getAccounts').resolves({
        accounts: [
          {
            account_id: bankAccount.externalId,
            mask: bankAccount.lastFour,
            name: bankAccount.displayName,
            balances: {
              current: bankAccount.current,
              available: bankAccount.available,
            },
            type: 'depository',
            subtype: 'checking',
          },
        ],
      });
    });

    const fixture = 'plaid/getAccounts-success-token3-2.json';
    const expectedValues = { available: 100, current: 110, transactionCount: 1 };

    it(
      'should not update bank account if the user already has a successful plaid balance check for today',
      replayHttp(
        fixture,
        async () => {
          await BalanceCheck.create({
            bankConnectionId: bankAccount.bankConnectionId,
            trigger: BalanceCheckTrigger.USER_REFRESH,
            successful: true,
          });
          const { available, current } = bankAccount;
          await request(app)
            .post(`/v2/bank_account/${bankAccount.id}/refresh`)
            .set('Authorization', bankAccount.userId.toString())
            .set('X-Device-Id', bankAccount.userId.toString())
            .expect(200);

          await bankAccount.reload();

          expect(bankAccount.available).to.equal(available);
          expect(bankAccount.current).to.equal(current);
          const transactions = await bankAccount.getBankTransactions();
          expect(transactions.length).to.equal(0);
        },
        { before: cleanPlaidDates },
      ),
    );

    it(
      'should update bank account data and pull transactions',
      replayHttp(
        fixture,
        async () => {
          await request(app)
            .post(`/v2/bank_account/${bankAccount.id}/refresh`)
            .set('Authorization', bankAccount.userId.toString())
            .set('X-Device-Id', bankAccount.userId.toString())
            .expect(200);

          await bankAccount.reload();
          expect(bankAccount.available).to.equal(expectedValues.available);
          expect(bankAccount.current).to.equal(expectedValues.current);
        },
        { before: cleanPlaidDates },
      ),
    );

    it('should throw an error if user is paused', async () => {
      await factory.create('membership-pause', { userId: bankAccount.userId });
      const refreshBalanceSpy = sandbox.spy(BankingDataSync, 'refreshBalance');
      const response = await request(app)
        .post(`/v2/bank_account/${bankAccount.id}/refresh`)
        .set('Authorization', bankAccount.userId.toString())
        .set('X-Device-Id', bankAccount.userId.toString());

      expect(response.status).to.be.eq(403);
      expect(response.body.message).to.be.match(
        /Can't refresh account balance if they are paused\./,
      );

      sinon.assert.notCalled(syncTransactionStub);
      sinon.assert.notCalled(refreshBalanceSpy);
    });

    it(
      'should not update bank account data and pull transactions',
      replayHttp(
        fixture,
        async () => {
          await factory.create('membership-pause', { userId: bankAccount.userId });
          const response = await request(app)
            .post(`/v2/bank_account/${bankAccount.id}/refresh`)
            .set('Authorization', bankAccount.userId.toString())
            .set('X-Device-Id', bankAccount.userId.toString());
          expect(response.status).to.equal(403);
          expect(response.body.message).to.match(
            /Can't refresh account balance if they are paused\./,
          );
        },
        { before: cleanPlaidDates },
      ),
    );

    it(
      'should add to the plaid audit log',
      replayHttp(
        fixture,
        async () => {
          await request(app)
            .post(`/v2/bank_account/${bankAccount.id}/refresh`)
            .set('Authorization', bankAccount.userId.toString())
            .set('X-Device-Id', bankAccount.userId.toString())
            .expect(200);

          const plaidRequest = await BalanceCheck.findAll({
            where: {
              bankConnectionId: bankAccount.bankConnectionId,
              trigger: BalanceCheckTrigger.USER_REFRESH,
            },
          });

          expect(plaidRequest.length).to.equal(1);
          expect(plaidRequest[0].created.isSame(moment(), 'day')).to.be.true;
        },
        { before: cleanPlaidDates },
      ),
    );

    it(
      'should create a balance log',
      replayHttp(
        fixture,
        async () => {
          const bigQuerySpy = sandbox.spy(BankingDataClient, 'saveBalanceLogs');
          await request(app)
            .post(`/v2/bank_account/${bankAccount.id}/refresh`)
            .set('Authorization', bankAccount.userId.toString())
            .set('X-Device-Id', bankAccount.userId.toString())
            .expect(200);

          expect(bigQuerySpy.callCount).to.eq(1);
          const balance = bigQuerySpy.firstCall.args[0];
          expect(balance.available).to.equal(expectedValues.available);
          expect(balance.current).to.equal(expectedValues.current);
          expect(moment().diff(moment(balance.timestamp), 'second')).to.be.lessThan(1);
        },
        { before: cleanPlaidDates },
      ),
    );

    it(
      'should throw an error if default account was deleted',
      replayHttp(
        fixture,
        async () => {
          const bankAccountNew = await factory.create('bank-account', {
            userId: bankAccount.userId,
            bankConnectionId: bankAccount.bankConnectionId,
            synapseNodeId: null,
          });
          const user = await bankAccountNew.getUser();
          await user.update({ defaultBankAccountId: bankAccountNew.id });
          const { body } = await request(app)
            .post(`/v2/bank_account/${bankAccountNew.id}/refresh`)
            .set('Authorization', bankAccountNew.userId.toString())
            .set('X-Device-Id', bankAccountNew.userId.toString())
            .expect(400);
          expect(body.message).to.contain('I lost connection to your default bank account.');
        },
        { before: cleanPlaidDates },
      ),
    );

    testPlaidRefreshErrors.call(this);

    const differentAccountIdFixture =
      'plaid/getAccounts-success-token3-2-different-externalId.json';
    testPlaidChangedAccountIdError.bind(this)(differentAccountIdFixture, cleanPlaidDates);

    it('should throw the correct error when a default bank account is deleted', async () => {
      const user: User = await User.findByPk(bankAccount.userId);
      expect(user.defaultBankAccountId).to.not.exist;
      await user.update({ defaultBankAccountId: bankAccount.id });

      await bankAccount.destroy();
      await bankAccount.reload({ paranoid: false });

      const result = await request(app)
        .post(`/v2/bank_account/${bankAccount.id}/refresh`)
        .set('Authorization', bankAccount.userId.toString())
        .set('X-Device-Id', bankAccount.userId.toString());

      expect(result.status).to.equal(400);
      expect(result.body.customCode).to.equal(CUSTOM_ERROR_CODES.DEFAULT_ACCOUNT_REMOVED);

      await user.update({ defaultBankAccountId: null });
      await bankAccount.restore();
    });

    it('should not throw the error when a default bank account is not deleted', async () => {
      const user: User = await User.findByPk(bankAccount.userId);
      expect(user.defaultBankAccountId).to.not.exist;
      await user.update({ defaultBankAccountId: bankAccount.id });

      await Promise.all([bankAccount.reload({ paranoid: false }), user.reload()]);

      const result = await request(app)
        .post(`/v2/bank_account/${bankAccount.id}/refresh`)
        .set('Authorization', bankAccount.userId.toString())
        .set('X-Device-Id', bankAccount.userId.toString());

      expect(result.body.customCode).to.not.equal(CUSTOM_ERROR_CODES.DEFAULT_ACCOUNT_REMOVED);

      await user.update({ defaultBankAccountId: null });
      await bankAccount.restore();
    });

    it('should throw a regular Dave 404 when a NON-default bank account is soft-deleted', async () => {
      const user: User = await User.findByPk(bankAccount.userId);
      expect(user.defaultBankAccountId).to.not.exist;

      await bankAccount.destroy();
      await bankAccount.reload({ paranoid: false });

      const result = await request(app)
        .post(`/v2/bank_account/${bankAccount.id}/refresh`)
        .set('Authorization', bankAccount.userId.toString())
        .set('X-Device-Id', bankAccount.userId.toString());

      expect(result.body.customCode).to.not.equal(CUSTOM_ERROR_CODES.DEFAULT_ACCOUNT_REMOVED);
      expect(result.status).to.equal(404);

      await user.update({ defaultBankAccountId: null });
      await bankAccount.restore();
    });

    it('should throw an error if transaction data is not ready', async () => {
      sandbox.stub(BankingDataSync, 'upsertBankAccounts');
      sandbox.stub(BankingDataSync, 'refreshBalance');
      await bankConnection.update({ initialPull: null });

      const response = await request(app)
        .post(`/v2/bank_account/${bankAccount.id}/refresh`)
        .set('Authorization', bankAccount.userId.toString())
        .set('X-Device-Id', bankAccount.userId.toString());

      expect(response.status).to.be.eq(400);
      expect(response.body.message).to.match(
        /Can't refresh account before recieving intitial pull\./,
      );

      sinon.assert.notCalled(syncTransactionStub);
    });
  });

  context('Bank Of Dave', () => {
    const token = '2a82e635-d1dd-46c1-bc82-56f722a6e698';
    const externalId = '0b39346b-9b00-4aee-a11e-0428fd13df81';

    const expectedBankAccountResponses = {
      available: 527.43,
      current: 527.43,
      transactionCount: 1,
      type: BankAccountType.Depository,
      subtype: BankAccountSubtype.Checking,
      externalId,
    };

    beforeEach(async () => {
      const { id: userId } = await factory.create('user');
      const { id: bankConnectionId } = await factory.create('bank-connection', {
        userId,
        authToken: token,
        bankingDataSource: 'BANK_OF_DAVE',
      });

      bankAccount = await factory.create('bank-account', {
        userId,
        bankConnectionId,
        externalId,
      });

      const expectedTransactionResponses = [
        {
          externalId: faker.random.uuid(),
          bankAccountExternalId: externalId,
          amount: 10,
          transactionDate: moment(),
          pending: false,
          externalName: 'Fake external name',
        },
      ];

      sandbox
        .stub(BankOfDaveInternalApiIntegration.prototype, 'getAccounts')
        .resolves([expectedBankAccountResponses]);
      sandbox
        .stub(BankOfDaveInternalApiIntegration.prototype, 'getBalance')
        .resolves([expectedBankAccountResponses]);
      sandbox
        .stub(BankOfDaveInternalApiIntegration.prototype, 'getTransactions')
        .resolves(expectedTransactionResponses);
    });

    it('allows multiple refreshes per day', async () => {
      await BalanceCheck.create({
        bankConnectionId: bankAccount.bankConnectionId,
        trigger: BalanceCheckTrigger.USER_REFRESH,
      });

      await request(app)
        .post(`/v2/bank_account/${bankAccount.id}/refresh`)
        .set('Authorization', bankAccount.userId.toString())
        .set('X-Device-Id', bankAccount.userId.toString())
        .expect(200);

      await bankAccount.reload();

      expect(bankAccount.available).to.equal(expectedBankAccountResponses.available);

      expect(bankAccount.current).to.equal(expectedBankAccountResponses.current);

      expect(syncTransactionStub.callCount).to.eq(1);
    });

    it('allows multiple refreshes per day even when user is paused', async () => {
      await Promise.all([
        BalanceCheck.create({
          bankConnectionId: bankAccount.bankConnectionId,
          trigger: BalanceCheckTrigger.USER_REFRESH,
        }),
        factory.create('membership-pause', { userId: bankAccount.userId }),
      ]);
      await request(app)
        .post(`/v2/bank_account/${bankAccount.id}/refresh`)
        .set('Authorization', bankAccount.userId.toString())
        .set('X-Device-Id', bankAccount.userId.toString())
        .expect(200);

      await bankAccount.reload();

      expect(bankAccount.available).to.equal(expectedBankAccountResponses.available);
      expect(bankAccount.current).to.equal(expectedBankAccountResponses.current);
      expect(syncTransactionStub.callCount).to.eq(1);
    });

    it('should update bank account data and pull transactions', async () => {
      await request(app)
        .post(`/v2/bank_account/${bankAccount.id}/refresh`)
        .set('Authorization', bankAccount.userId.toString())
        .set('X-Device-Id', bankAccount.userId.toString())
        .expect(200);

      await bankAccount.reload();
      expect(bankAccount.available).to.equal(expectedBankAccountResponses.available);
      expect(bankAccount.current).to.equal(expectedBankAccountResponses.current);
      expect(syncTransactionStub.callCount).to.eq(1);
    });

    it('should add to the plaid audit log', async () => {
      await request(app)
        .post(`/v2/bank_account/${bankAccount.id}/refresh`)
        .set('Authorization', bankAccount.userId.toString())
        .set('X-Device-Id', bankAccount.userId.toString())
        .expect(200);

      const plaidRequest = await BalanceCheck.findAll({
        where: {
          bankConnectionId: bankAccount.bankConnectionId,
          trigger: BalanceCheckTrigger.USER_REFRESH,
        },
      });

      expect(plaidRequest.length).to.equal(1);
      expect(plaidRequest[0].created.isSame(moment(), 'day')).to.be.true;
    });

    it('should create a balance log', async () => {
      const balanceLogSpy = sandbox.spy(BankingDataClient, 'saveBalanceLogs');
      await request(app)
        .post(`/v2/bank_account/${bankAccount.id}/refresh`)
        .set('Authorization', bankAccount.userId.toString())
        .set('X-Device-Id', bankAccount.userId.toString())
        .expect(200);

      expect(balanceLogSpy.callCount).to.eq(1);
      const balance = balanceLogSpy.firstCall.args[0];
      expect(balance.available).to.equal(expectedBankAccountResponses.available);
      expect(balance.current).to.equal(expectedBankAccountResponses.current);
      expect(moment().diff(moment(balance.timestamp), 'second')).to.be.lessThan(1);
    });
  });

  function testPlaidRefreshErrors() {
    it('user refresh custom error codes have not diverged from the UI', () => {
      expect(CUSTOM_ERROR_CODES.BANK_CONNECTION_DISCONNECTED).to.equal(350);
      expect(CUSTOM_ERROR_CODES.BANK_ACCOUNT_TRY_AGAIN).to.equal(351);
      expect(CUSTOM_ERROR_CODES.BANK_BALANCE_ACCESS_LIMIT).to.equal(352);
      expect(CUSTOM_ERROR_CODES.BANK_DATA_SOURCE_SERVER_ERROR).to.equal(353);
      expect(CUSTOM_ERROR_CODES.DEFAULT_ACCOUNT_REMOVED).to.equal(380);
    });

    const testCases: PlaidTestCase[] = [
      {
        expectedCustomCode: CUSTOM_ERROR_CODES.BANK_CONNECTION_DISCONNECTED,
        plaidErrorCode: PlaidErrorCode.ItemLoginRequired,
        plaidErrorType: PlaidErrorTypes.ItemError,
      },
      {
        expectedCustomCode: CUSTOM_ERROR_CODES.BANK_CONNECTION_DISCONNECTED,
        plaidErrorCode: PlaidErrorCode.NoAccounts,
        plaidErrorType: PlaidErrorTypes.ItemError,
      },
      {
        expectedCustomCode: CUSTOM_ERROR_CODES.BANK_CONNECTION_DISCONNECTED,
        plaidErrorCode: PlaidErrorCode.MFANotSupported,
        plaidErrorType: PlaidErrorTypes.ItemError,
      },
      {
        expectedCustomCode: CUSTOM_ERROR_CODES.BANK_CONNECTION_DISCONNECTED,
        plaidErrorCode: PlaidErrorCode.InstitutionNoLongerSupported,
        plaidErrorType: PlaidErrorTypes.InstitutionError,
      },
      {
        expectedCustomCode: CUSTOM_ERROR_CODES.BANK_CONNECTION_DISCONNECTED,
        plaidErrorCode: PlaidErrorCode.ItemNotSupported,
        plaidErrorType: PlaidErrorTypes.ItemError,
      },
      // Try again errors
      {
        expectedCustomCode: CUSTOM_ERROR_CODES.BANK_ACCOUNT_TRY_AGAIN,
        plaidErrorCode: PlaidErrorCode.InstitutionNotResponding,
        plaidErrorType: PlaidErrorTypes.InstitutionError,
      },
      {
        expectedCustomCode: CUSTOM_ERROR_CODES.BANK_ACCOUNT_TRY_AGAIN,
        plaidErrorCode: PlaidErrorCode.InstitutionDown,
        plaidErrorType: PlaidErrorTypes.InstitutionError,
      },
      {
        expectedCustomCode: CUSTOM_ERROR_CODES.BANK_ACCOUNT_TRY_AGAIN,
        plaidErrorCode: PlaidErrorCode.ProductNotReady,
        plaidErrorType: PlaidErrorTypes.ItemError,
      },
      // Rate limit exceeded errors
      {
        expectedCustomCode: CUSTOM_ERROR_CODES.BANK_BALANCE_ACCESS_LIMIT,
        plaidErrorCode: PlaidErrorCode.BalanceLimit,
        plaidErrorType: PlaidErrorTypes.RateLimitExceeded,
      },
      // Plaid server error
      {
        expectedCustomCode: CUSTOM_ERROR_CODES.BANK_DATA_SOURCE_SERVER_ERROR,
        plaidErrorCode: PlaidErrorCode.InternalServerError,
        plaidErrorType: PlaidErrorTypes.ApiError,
      },
    ];

    testCases.forEach(testRefreshPlaidErrorCodes.bind(this));
    testCases.forEach(testUpsertAccountPlaidErrorCodes.bind(this));

    testBalanceCanBeRefreshedAfterFailedBalanceRefresh.bind(this)(testCases[0]);
  }

  function testRefreshPlaidErrorCodes(plaidTestCase: PlaidTestCase) {
    const expectedHttpStatusCode = 400;

    it(`should handle "${plaidTestCase.plaidErrorCode}" errors with custom error code of ${plaidTestCase.expectedCustomCode} and http status of ${expectedHttpStatusCode}`, async () => {
      sandbox.stub(plaidClient, 'getBalance').rejects({
        error_type: plaidTestCase.plaidErrorType,
        error_code: plaidTestCase.plaidErrorCode,
      });

      const result = await request(app)
        .post(`/v2/bank_account/${bankAccount.id}/refresh`)
        .set('Authorization', bankAccount.userId.toString())
        .set('X-Device-Id', bankAccount.userId.toString())
        .expect(expectedHttpStatusCode);

      expect(result.body.customCode).equal(plaidTestCase.expectedCustomCode);
    });
  }

  function testUpsertAccountPlaidErrorCodes(plaidTestCase: PlaidTestCase) {
    const expectedHttpStatusCode = 400;

    it(`should handle "${plaidTestCase.plaidErrorCode}" errors with custom error code of ${plaidTestCase.expectedCustomCode} and http status of ${expectedHttpStatusCode}`, async () => {
      accountsStub.rejects({
        error_type: plaidTestCase.plaidErrorType,
        error_code: plaidTestCase.plaidErrorCode,
      });

      const result = await request(app)
        .post(`/v2/bank_account/${bankAccount.id}/refresh`)
        .set('Authorization', bankAccount.userId.toString())
        .set('X-Device-Id', bankAccount.userId.toString())
        .expect(expectedHttpStatusCode);

      expect(result.body.customCode).equal(plaidTestCase.expectedCustomCode);
    });
  }

  function testBalanceCanBeRefreshedAfterFailedBalanceRefresh(plaidTestCase: PlaidTestCase) {
    it('should be able to refresh balance after a failed balance refresh', async () => {
      sandbox.stub(plaidClient, 'getBalance').rejects({
        error_type: plaidTestCase.plaidErrorType,
        error_code: plaidTestCase.plaidErrorCode,
      });
      const spy = sandbox.spy(PlaidIntegration.prototype, 'getBalance');

      await request(app)
        .post(`/v2/bank_account/${bankAccount.id}/refresh`)
        .set('Authorization', bankAccount.userId.toString())
        .set('X-Device-Id', bankAccount.userId.toString())
        .expect(400);

      spy.should.have.callCount(1);

      await request(app)
        .post(`/v2/bank_account/${bankAccount.id}/refresh`)
        .set('Authorization', bankAccount.userId.toString())
        .set('X-Device-Id', bankAccount.userId.toString());

      spy.should.have.callCount(2);
    });
  }

  function testPlaidChangedAccountIdError(fixture: string, cleanDates: any) {
    const expectedErrorCode = CUSTOM_ERROR_CODES.BANK_ACCOUNT_TRY_AGAIN;
    it(
      `should return a custom error code of ${expectedErrorCode} for no longer finding matching account externalId with plaid`,
      replayHttp(
        fixture,
        async () => {
          const result = await request(app)
            .post(`/v2/bank_account/${bankAccount.id}/refresh`)
            .set('Authorization', bankAccount.userId.toString())
            .set('X-Device-Id', bankAccount.userId.toString())
            .expect(400);

          expect(result.body.customCode).equal(expectedErrorCode);
        },
        { before: cleanDates },
      ),
    );
  }

  function cleanPlaidDates(scope: any): any {
    scope.filteringRequestBody = (incoming: any, recorded: any) => {
      const parsedIncoming = JSON.parse(incoming);
      parsedIncoming.start_date = recorded.start_date;
      parsedIncoming.end_date = recorded.end_date;
      return JSON.stringify(parsedIncoming);
    };
  }
});
