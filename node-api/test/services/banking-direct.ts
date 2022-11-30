import {
  AccountStatus,
  ApiAccountType,
  IInternalApiBankAccount,
  IInternalApiTransaction,
  INotFoundErrorApiResponseCustomCodeEnum,
  IUnauthorizedErrorResponseCustomCodeEnum,
  IValidationErrorResponseCustomCodeEnum,
  TransactionStatus,
} from '@dave-inc/banking-internal-api-client';
import * as bcrypt from 'bcrypt';
import { expect } from 'chai';
import * as config from 'config';
import { Request } from 'express';
import 'mocha';
import * as sinon from 'sinon';
import * as request from 'supertest';
import { BankingDirectError } from '../../src/lib/error';
import { BankConnection, BankingDirectUserSession, User } from '../../src/models';
import app from '../../src/services/banking-direct';
import { BankingInternalApiClient } from '../../src/services/banking-direct/helpers';
import { requireDirectToken, requireSecret } from '../../src/services/banking-direct/middleware';
import { IBankingDirectRequest } from '../../src/typings';
import factory from '../../test/factories';
import { clean, up } from '../test-helpers';
import stubBankTransactionClient from '../test-helpers/stub-bank-transaction-client';

describe('Banking Direct', () => {
  const PLAID_DIRECT_SECRET = config.get<string>('bankingDirect.plaidSecret');
  const PLAID_CLIENT_ID = config.get<string>('bankingDirect.plaidClientId');

  const sandbox = sinon.createSandbox();

  const mockedDaveBankingAccount: IInternalApiBankAccount = {
    accountNumber: '111122223333',
    createdAt: '2021-01-01',
    currentBalance: 100.12,
    id: '0b39346b-9b00-4aee-a11e-0428fd13df81',
    name: "Dave DaBear's Checking Account",
    routingNumber: '000011112222',
    status: AccountStatus.Active,
    accountType: ApiAccountType.Checking,
  };

  const mockedDaveBankingTransaction: IInternalApiTransaction = {
    id: '2dee9c11-40f2-4692-8453-85d0f6745982',
    amount: 10.23,
    isDirectDeposit: false,
    transactedAt: '2020-03-25T01:53:07.000Z',
    settledAt: '2020-03-25T01:53:07.000Z',
    status: TransactionStatus.Settled,
    name: 'Dave',
  };

  const expectedPassword = 'Password1';

  let daveBankingConnection: BankConnection;
  let userWithDaveBanking: User;
  let userWithoutDaveBanking: User;

  before(() => clean());

  beforeEach(async () => {
    stubBankTransactionClient(sandbox);
    await up();

    daveBankingConnection = await factory.create('bank-of-dave-bank-connection');
    userWithDaveBanking = await User.findByPk(daveBankingConnection.userId);
    userWithDaveBanking.email = 'test2@test.com';
    userWithDaveBanking.password = await bcrypt.hash(expectedPassword, 10);
    await userWithDaveBanking.save();

    userWithoutDaveBanking = await factory.create('user', {
      email: 'test@test.com',
      password: await bcrypt.hash(expectedPassword, 10),
    });
  });

  afterEach(() => clean(sandbox));

  describe('requireSecret middleware', () => {
    it('should fail if a secret is not passed', async () => {
      const spy = sinon.spy();
      const bogusRequest = { get: () => null as string };
      await requireSecret((bogusRequest as unknown) as Request, null, spy);
      const args = spy.getCall(0).args;

      expect(args.length).to.equal(1);
      expect(args[0]).to.be.an.instanceOf(BankingDirectError);
      expect(args[0].data.error.id).to.be.equal(900);
      expect(args[0].data.error.message).to.be.equal('Mismatch of plaid credentials');
    });

    it('should fail if the secret does not match', async () => {
      const spy = sinon.spy();
      const bogusRequest = { get: () => 'fizzbuzz' };
      await requireSecret((bogusRequest as unknown) as Request, null, spy);
      const args = spy.getCall(0).args;
      expect(args.length).to.equal(1);
      expect(args[0]).to.be.an.instanceOf(BankingDirectError);
    });

    it('should fail if a clientId is not passed', async () => {
      const spy = sinon.spy();
      const bogusRequest = {
        get: (field: string) => {
          if (field === 'X-PLAID-SECRET') {
            return PLAID_DIRECT_SECRET;
          } else if (field === 'X-PLAID-CLIENT-ID') {
            return;
          }
        },
      };

      await requireSecret((bogusRequest as unknown) as Request, null, spy);
      const args = spy.getCall(0).args;
      expect(args.length).to.equal(1);
      expect(args[0]).to.be.an.instanceOf(BankingDirectError);
    });

    it('should fail if the clientId does not match', async () => {
      const spy = sinon.spy();
      const bogusRequest = {
        get: (field: string) => {
          if (field === 'X-PLAID-SECRET') {
            return PLAID_DIRECT_SECRET;
          } else if (field === 'X-PLAID-CLIENT-ID') {
            return 'asdfdsfdsfasdfas';
          }
        },
      };

      await requireSecret((bogusRequest as unknown) as Request, null, spy);
      const args = spy.getCall(0).args;
      expect(args.length).to.equal(1);
      expect(args[0]).to.be.an.instanceOf(BankingDirectError);
    });

    it('should succeed if the secret and clientId match', async () => {
      const spy = sinon.spy();
      const bogusRequest = {
        get: (field: string) => {
          if (field === 'X-PLAID-SECRET') {
            return PLAID_DIRECT_SECRET;
          } else if (field === 'X-PLAID-CLIENT-ID') {
            return PLAID_CLIENT_ID;
          }
        },
      };

      await requireSecret((bogusRequest as unknown) as Request, null, spy);
      const args = spy.getCall(0).args;
      expect(args.length).to.equal(0);
    });
  });

  describe('requireDirectToken middleware', () => {
    it('should fail if the headers are not sent', async () => {
      const spy = sinon.spy();
      const bogusRequest = { get: () => null as string };
      await requireDirectToken((bogusRequest as unknown) as IBankingDirectRequest, null, spy);
      const args = spy.getCall(0).args;
      expect(args.length).to.equal(1);
      expect(args[0]).to.be.an.instanceOf(BankingDirectError);
    });

    it('should fail if the headers do not correspond to a user', async () => {
      const spy = sinon.spy();
      const requestGetStub = sandbox.stub();
      requestGetStub.onCall(0).returns('fizz');
      requestGetStub.onCall(1).returns('buzz');
      const bogusRequest = { get: requestGetStub };
      await requireDirectToken((bogusRequest as unknown) as IBankingDirectRequest, null, spy);
      const args = spy.getCall(0).args;
      expect(args.length).to.equal(1);
      expect(args[0]).to.be.an.instanceOf(BankingDirectError);
    });

    it('should succeed if the user is found and should set req.user', async () => {
      const bankingDirectUserSession = await factory.create('banking-direct-user-session');
      const spy = sinon.spy();
      const requestGetStub = sandbox.stub();
      requestGetStub.onCall(0).returns(bankingDirectUserSession.token);
      requestGetStub.onCall(1).returns(bankingDirectUserSession.userId);
      const bogusRequest = ({ get: requestGetStub } as unknown) as IBankingDirectRequest;
      await requireDirectToken(bogusRequest, null, spy);
      const args = spy.getCall(0).args;
      expect(args.length).to.equal(0);
      expect(bogusRequest.user).to.exist;
      expect(bogusRequest.user.id).to.equal(bankingDirectUserSession.userId);
    });
  });

  describe('POST /user/auth_token', () => {
    it('should fail with 401 if the username or password are not passed', async () => {
      return request(app)
        .post('/services/banking_direct/v1/users/auth_token')
        .set('X-PLAID-CLIENT-ID', PLAID_CLIENT_ID)
        .set('X-PLAID-SECRET', PLAID_DIRECT_SECRET)
        .expect(401);
    });

    it('should fail with 401 if it cannot authenticate', async () => {
      return request(app)
        .post('/services/banking_direct/v1/users/auth_token')
        .send('username=blah')
        .send('password=blah')
        .set('X-PLAID-CLIENT-ID', PLAID_CLIENT_ID)
        .set('X-PLAID-SECRET', PLAID_DIRECT_SECRET)
        .expect(401);
    });

    it('should fail with 401 if the user is not a bank user', async () => {
      return request(app)
        .post('/services/banking_direct/v1/users/auth_token')
        .send(`username=${userWithoutDaveBanking.email}`)
        .send(`password=${expectedPassword}`)
        .set('X-PLAID-CLIENT-ID', PLAID_CLIENT_ID)
        .set('X-PLAID-SECRET', PLAID_DIRECT_SECRET)
        .expect(401);
    });

    it('should fail with 401 if the user account is locked', async () => {
      return request(app)
        .post('/services/banking_direct/v1/users/auth_token')
        .send(`username=${userWithoutDaveBanking.email}`)
        .send(`password=${expectedPassword}`)
        .set('X-PLAID-CLIENT-ID', PLAID_CLIENT_ID)
        .set('X-PLAID-SECRET', PLAID_DIRECT_SECRET)
        .expect(401);
    });

    it('should fail with 401 if empty accounts array', async () => {
      sandbox.stub(BankingInternalApiClient, 'getUserBankAccounts').resolves({
        data: {
          bankAccounts: [],
        },
      });

      await request(app)
        .post('/services/banking_direct/v1/users/auth_token')
        .send(`username=${userWithDaveBanking.email}`)
        .send(`password=${expectedPassword}`)
        .set('X-PLAID-CLIENT-ID', PLAID_CLIENT_ID)
        .set('X-PLAID-SECRET', PLAID_DIRECT_SECRET)
        .expect(401);
    });

    it('should fail with 401 if closed account', async () => {
      const mockedClosedDaveBankingAccount: IInternalApiBankAccount = {
        ...mockedDaveBankingAccount,
        status: AccountStatus.Closed,
      };

      sandbox.stub(BankingInternalApiClient, 'getUserBankAccounts').resolves({
        data: {
          bankAccounts: [mockedClosedDaveBankingAccount],
        },
      });

      await request(app)
        .post('/services/banking_direct/v1/users/auth_token')
        .send(`username=${userWithDaveBanking.email}`)
        .send(`password=${expectedPassword}`)
        .set('X-PLAID-CLIENT-ID', PLAID_CLIENT_ID)
        .set('X-PLAID-SECRET', PLAID_DIRECT_SECRET)
        .expect(401);
    });

    it('should succeed with active account, create banking_direct_user_session, and send auth token', async () => {
      sandbox.stub(BankingInternalApiClient, 'getUserBankAccounts').resolves({
        data: {
          bankAccounts: [mockedDaveBankingAccount],
        },
      });

      const { body } = await request(app)
        .post('/services/banking_direct/v1/users/auth_token')
        .send(`username=${userWithDaveBanking.email}`)
        .send(`password=${expectedPassword}`)
        .set('X-PLAID-CLIENT-ID', PLAID_CLIENT_ID)
        .set('X-PLAID-SECRET', PLAID_DIRECT_SECRET)
        .expect(200);

      const resultSession = await BankingDirectUserSession.findOne({
        where: {
          userId: body.user_id,
        },
      });

      expect(body.user_id).to.equal(userWithDaveBanking.id);
      expect(body.auth_token).to.equal(resultSession.token);
    });
  });

  describe('GET /users/:userId', () => {
    let session: BankingDirectUserSession;

    beforeEach(async () => {
      session = await BankingDirectUserSession.create({
        userId: userWithDaveBanking.id,
      });
    });

    it('should fail with 400 if internal api rejects with validation error', async () => {
      sandbox.stub(BankingInternalApiClient, 'getUserBankAccounts').rejects({
        customCode: IValidationErrorResponseCustomCodeEnum.ValidationError,
      });

      await request(app)
        .get(`/services/banking_direct/v1/users/${userWithDaveBanking.id}`)
        .set('X-PLAID-CLIENT-ID', PLAID_CLIENT_ID)
        .set('X-PLAID-SECRET', PLAID_DIRECT_SECRET)
        .set('X-PLAID-AUTH-TOKEN', session.token)
        .set('X-PLAID-USER-ID', String(userWithDaveBanking.id))
        .expect(400);
    });

    it('should fail with 401 if internal api rejects with unauthorized error', async () => {
      sandbox.stub(BankingInternalApiClient, 'getUserBankAccounts').rejects({
        customCode: IUnauthorizedErrorResponseCustomCodeEnum.Unauthorized,
      });

      await request(app)
        .get(`/services/banking_direct/v1/users/${userWithDaveBanking.id}`)
        .set('X-PLAID-CLIENT-ID', PLAID_CLIENT_ID)
        .set('X-PLAID-SECRET', PLAID_DIRECT_SECRET)
        .set('X-PLAID-AUTH-TOKEN', session.token)
        .set('X-PLAID-USER-ID', String(userWithDaveBanking.id))
        .expect(401);
    });

    it('should fail with 401 if internal api rejects with not found error', async () => {
      sandbox.stub(BankingInternalApiClient, 'getUserBankAccounts').rejects({
        customCode: INotFoundErrorApiResponseCustomCodeEnum.NotFound,
      });

      await request(app)
        .get(`/services/banking_direct/v1/users/${userWithDaveBanking.id}`)
        .set('X-PLAID-CLIENT-ID', PLAID_CLIENT_ID)
        .set('X-PLAID-SECRET', PLAID_DIRECT_SECRET)
        .set('X-PLAID-AUTH-TOKEN', session.token)
        .set('X-PLAID-USER-ID', String(userWithDaveBanking.id))
        .expect(401);
    });

    it('should fail with 401 if internal api returns no spending accounts', async () => {
      const mockedGoalsAccount: IInternalApiBankAccount = {
        ...mockedDaveBankingAccount,
        id: 'goals-account-id',
        accountType: ApiAccountType.Goal,
      };

      sandbox.stub(BankingInternalApiClient, 'getUserBankAccounts').resolves({
        data: {
          bankAccounts: [mockedGoalsAccount],
        },
      });

      await request(app)
        .get(`/services/banking_direct/v1/users/${userWithDaveBanking.id}`)
        .set('X-PLAID-CLIENT-ID', PLAID_CLIENT_ID)
        .set('X-PLAID-SECRET', PLAID_DIRECT_SECRET)
        .set('X-PLAID-AUTH-TOKEN', session.token)
        .set('X-PLAID-USER-ID', String(userWithDaveBanking.id))
        .expect(401);
    });

    it('should fail with 502 if internal api rejects with unhandled error', async () => {
      sandbox.stub(BankingInternalApiClient, 'getUserBankAccounts').rejects({
        customCode: 'UNHANDLED',
      });

      await request(app)
        .get(`/services/banking_direct/v1/users/${userWithDaveBanking.id}`)
        .set('X-PLAID-CLIENT-ID', PLAID_CLIENT_ID)
        .set('X-PLAID-SECRET', PLAID_DIRECT_SECRET)
        .set('X-PLAID-AUTH-TOKEN', session.token)
        .set('X-PLAID-USER-ID', String(userWithDaveBanking.id))
        .expect(502);
    });

    it('should succeed and return the plaid user response', async () => {
      // goals account should be ignored
      const mockedGoalsAccount: IInternalApiBankAccount = {
        ...mockedDaveBankingAccount,
        id: 'goals-account-id',
        accountType: ApiAccountType.Goal,
      };

      sandbox.stub(BankingInternalApiClient, 'getUserBankAccounts').resolves({
        data: {
          bankAccounts: [mockedGoalsAccount, mockedDaveBankingAccount],
        },
      });

      const daveBankingUUID = await userWithDaveBanking.getDaveBankingUUID();

      const { body } = await request(app)
        .get(`/services/banking_direct/v1/users/${userWithDaveBanking.id}`)
        .set('X-PLAID-CLIENT-ID', PLAID_CLIENT_ID)
        .set('X-PLAID-SECRET', PLAID_DIRECT_SECRET)
        .set('X-PLAID-AUTH-TOKEN', session.token)
        .set('X-PLAID-USER-ID', String(userWithDaveBanking.id))
        .expect(200);

      const identity = body.identities[0];
      expect(identity.id).to.equal(daveBankingUUID);
      expect(identity.email).to.equal(userWithDaveBanking.email);
      expect(identity.name).to.equal(
        `${userWithDaveBanking.firstName} ${userWithDaveBanking.lastName}`,
      );
      expect(identity.address).to.equal(userWithDaveBanking.addressLine1);
      expect(identity.address2).to.equal(userWithDaveBanking.addressLine2);
      expect(identity.city).to.equal(userWithDaveBanking.city);
      expect(identity.state).to.equal(userWithDaveBanking.state);
      expect(identity.postalCode).to.equal(userWithDaveBanking.zipCode);
      expect(identity.phone).to.equal(userWithDaveBanking.phoneNumber);

      const account = body.accounts[0];
      expect(account.id).to.equal(mockedDaveBankingAccount.id);
      expect(account.ownerIdentities[0]).to.equal(daveBankingUUID);
      expect(account.name).to.equal('Dave Banking');
      expect(account.currentBalance).to.equal(mockedDaveBankingAccount.currentBalance.toFixed(2));
      expect(account.availableBalance).to.equal(mockedDaveBankingAccount.currentBalance.toFixed(2));
      expect(account.routingNumber).to.equal(mockedDaveBankingAccount.routingNumber);
      expect(account.wireRouting).to.equal(mockedDaveBankingAccount.routingNumber);
      expect(account.accountNumber).to.equal(mockedDaveBankingAccount.accountNumber);
    });
  });

  describe('GET /users/:userId/transactions', () => {
    let session: BankingDirectUserSession;
    let getAccountStub: sinon.SinonStub;

    beforeEach(async () => {
      getAccountStub = sandbox.stub(BankingInternalApiClient, 'getUserBankAccounts').resolves({
        data: {
          bankAccounts: [mockedDaveBankingAccount],
        },
      });

      session = await BankingDirectUserSession.create({
        userId: userWithDaveBanking.id,
      });
    });

    it('should fail with 400 if internal api rejects with validation error', async () => {
      sandbox.stub(BankingInternalApiClient, 'getBankAccountTransactions').rejects({
        customCode: IValidationErrorResponseCustomCodeEnum.ValidationError,
      });

      await request(app)
        .get(`/services/banking_direct/v1/users/${userWithDaveBanking.id}/transactions`)
        .set('X-PLAID-CLIENT-ID', PLAID_CLIENT_ID)
        .set('X-PLAID-SECRET', PLAID_DIRECT_SECRET)
        .set('X-PLAID-AUTH-TOKEN', session.token)
        .set('X-PLAID-USER-ID', String(userWithDaveBanking.id))
        .expect(400);
    });

    it('should fail with 401 if internal api rejects with unauthorized error', async () => {
      sandbox.stub(BankingInternalApiClient, 'getBankAccountTransactions').rejects({
        customCode: IUnauthorizedErrorResponseCustomCodeEnum.Unauthorized,
      });

      await request(app)
        .get(`/services/banking_direct/v1/users/${userWithDaveBanking.id}/transactions`)
        .set('X-PLAID-CLIENT-ID', PLAID_CLIENT_ID)
        .set('X-PLAID-SECRET', PLAID_DIRECT_SECRET)
        .set('X-PLAID-AUTH-TOKEN', session.token)
        .set('X-PLAID-USER-ID', String(userWithDaveBanking.id))
        .expect(401);
    });

    it('should fail with 401 if internal api rejects with not found error', async () => {
      sandbox.stub(BankingInternalApiClient, 'getBankAccountTransactions').rejects({
        customCode: INotFoundErrorApiResponseCustomCodeEnum.NotFound,
      });

      await request(app)
        .get(`/services/banking_direct/v1/users/${userWithDaveBanking.id}/transactions`)
        .set('X-PLAID-CLIENT-ID', PLAID_CLIENT_ID)
        .set('X-PLAID-SECRET', PLAID_DIRECT_SECRET)
        .set('X-PLAID-AUTH-TOKEN', session.token)
        .set('X-PLAID-USER-ID', String(userWithDaveBanking.id))
        .expect(401);
    });

    it('should fail with 401 if internal api returns no spending accounts', async () => {
      getAccountStub.resolves({
        data: {
          bankAccounts: [],
        },
      });

      await request(app)
        .get(`/services/banking_direct/v1/users/${userWithDaveBanking.id}/transactions`)
        .set('X-PLAID-CLIENT-ID', PLAID_CLIENT_ID)
        .set('X-PLAID-SECRET', PLAID_DIRECT_SECRET)
        .set('X-PLAID-AUTH-TOKEN', session.token)
        .set('X-PLAID-USER-ID', String(userWithDaveBanking.id))
        .expect(401);
    });

    it('should fail with 502 if internal api rejects with unhandled error', async () => {
      sandbox.stub(BankingInternalApiClient, 'getBankAccountTransactions').rejects({
        customCode: 'UNHANDLED',
      });

      await request(app)
        .get(`/services/banking_direct/v1/users/${userWithDaveBanking.id}/transactions`)
        .set('X-PLAID-CLIENT-ID', PLAID_CLIENT_ID)
        .set('X-PLAID-SECRET', PLAID_DIRECT_SECRET)
        .set('X-PLAID-AUTH-TOKEN', session.token)
        .set('X-PLAID-USER-ID', String(userWithDaveBanking.id))
        .expect(502);
    });

    it('should succeed and not return `cancelled` transactions', async () => {
      const mockedSettledTransaction: IInternalApiTransaction = {
        ...mockedDaveBankingTransaction,
        status: TransactionStatus.Canceled,
        settledAt: undefined,
      };
      sandbox.stub(BankingInternalApiClient, 'getBankAccountTransactions').resolves({
        data: {
          transactions: [mockedSettledTransaction],
        },
      });

      const { body } = await request(app)
        .get(`/services/banking_direct/v1/users/${userWithDaveBanking.id}/transactions`)
        .set('X-PLAID-CLIENT-ID', PLAID_CLIENT_ID)
        .set('X-PLAID-SECRET', PLAID_DIRECT_SECRET)
        .set('X-PLAID-AUTH-TOKEN', session.token)
        .set('X-PLAID-USER-ID', String(userWithDaveBanking.id))
        .expect(200);
      expect(body.transactions.length).to.equal(0);
    });

    it('should succeed and not return `returned` transactions', async () => {
      const mockedSettledTransaction: IInternalApiTransaction = {
        ...mockedDaveBankingTransaction,
        status: TransactionStatus.Returned,
        settledAt: undefined,
      };
      sandbox.stub(BankingInternalApiClient, 'getBankAccountTransactions').resolves({
        data: {
          transactions: [mockedSettledTransaction],
        },
      });

      const { body } = await request(app)
        .get(`/services/banking_direct/v1/users/${userWithDaveBanking.id}/transactions`)
        .set('X-PLAID-CLIENT-ID', PLAID_CLIENT_ID)
        .set('X-PLAID-SECRET', PLAID_DIRECT_SECRET)
        .set('X-PLAID-AUTH-TOKEN', session.token)
        .set('X-PLAID-USER-ID', String(userWithDaveBanking.id))
        .expect(200);
      expect(body.transactions.length).to.equal(0);
    });

    it('should succeed and return `settled` transactions', async () => {
      const mockedSettledTransaction: IInternalApiTransaction = {
        ...mockedDaveBankingTransaction,
        status: TransactionStatus.Settled,
        settledAt: '2020-03-25T01:53:07.000Z',
      };

      sandbox.stub(BankingInternalApiClient, 'getBankAccountTransactions').resolves({
        data: {
          transactions: [mockedSettledTransaction],
        },
      });

      const { body } = await request(app)
        .get(`/services/banking_direct/v1/users/${userWithDaveBanking.id}/transactions`)
        .set('X-PLAID-CLIENT-ID', PLAID_CLIENT_ID)
        .set('X-PLAID-SECRET', PLAID_DIRECT_SECRET)
        .set('X-PLAID-AUTH-TOKEN', session.token)
        .set('X-PLAID-USER-ID', String(userWithDaveBanking.id))
        .expect(200);
      expect(body.transactions.length).to.equal(1);
    });

    it('should succeed and return `pending` transactions', async () => {
      const mockedSettledTransaction: IInternalApiTransaction = {
        ...mockedDaveBankingTransaction,
        status: TransactionStatus.Pending,
        settledAt: undefined,
      };
      sandbox.stub(BankingInternalApiClient, 'getBankAccountTransactions').resolves({
        data: {
          transactions: [mockedSettledTransaction],
        },
      });

      const { body } = await request(app)
        .get(`/services/banking_direct/v1/users/${userWithDaveBanking.id}/transactions`)
        .set('X-PLAID-CLIENT-ID', PLAID_CLIENT_ID)
        .set('X-PLAID-SECRET', PLAID_DIRECT_SECRET)
        .set('X-PLAID-AUTH-TOKEN', session.token)
        .set('X-PLAID-USER-ID', String(userWithDaveBanking.id))
        .expect(200);
      expect(body.transactions.length).to.equal(1);
    });

    it('should succeed and return the plaid transaction response', async () => {
      sandbox.stub(BankingInternalApiClient, 'getBankAccountTransactions').resolves({
        data: {
          transactions: [mockedDaveBankingTransaction],
        },
      });

      const { body } = await request(app)
        .get(`/services/banking_direct/v1/users/${userWithDaveBanking.id}/transactions`)
        .set('X-PLAID-CLIENT-ID', PLAID_CLIENT_ID)
        .set('X-PLAID-SECRET', PLAID_DIRECT_SECRET)
        .set('X-PLAID-AUTH-TOKEN', session.token)
        .set('X-PLAID-USER-ID', String(userWithDaveBanking.id))
        .expect(200);

      const transaction = body.transactions[0];
      expect(transaction.id).to.equal(mockedDaveBankingTransaction.id);
      expect(transaction.accountId).to.equal(mockedDaveBankingAccount.id);
      expect(transaction.amount).to.equal(mockedDaveBankingTransaction.amount * -1); // Plaid expects inverse of what is returned from Internal API.
      expect(transaction.currency).to.equal('USD');
      expect(transaction.pending).to.be.false;
      expect(transaction.transactedAt).to.be.equal(mockedDaveBankingTransaction.transactedAt);
      expect(transaction.settledAt).to.be.equal(mockedDaveBankingTransaction.settledAt);
      expect(transaction.spenderIdentity).to.be.equal(daveBankingConnection.externalId);
      expect(transaction.description).to.be.equal(mockedDaveBankingTransaction.name);
    });

    it('should succeed and parse & send pagination data', async () => {
      const stub = sandbox
        .stub(BankingInternalApiClient, 'getBankAccountTransactions')
        .resolves({});

      const expectedQueryParams = {
        start: 2,
        limit: 10,
        start_date: '2020-01-02',
        end_date: '2020-03-01',
      };

      await request(app)
        .get(`/services/banking_direct/v1/users/${userWithDaveBanking.id}/transactions`)
        .query(expectedQueryParams)
        .set('X-PLAID-CLIENT-ID', PLAID_CLIENT_ID)
        .set('X-PLAID-SECRET', PLAID_DIRECT_SECRET)
        .set('X-PLAID-AUTH-TOKEN', session.token)
        .set('X-PLAID-USER-ID', String(userWithDaveBanking.id))
        .expect(200);

      expect(stub).to.have.been.calledWith(
        mockedDaveBankingAccount.id,
        expectedQueryParams.start_date,
        expectedQueryParams.end_date,
        expectedQueryParams.start + 1,
        expectedQueryParams.limit,
      );
    });

    it('should succeed and set default pagination data when optional params are not passed in', async () => {
      const stub = sandbox
        .stub(BankingInternalApiClient, 'getBankAccountTransactions')
        .resolves({});

      const queryParams = {
        start_date: '2020-01-02',
        end_date: '2020-03-01',
      };

      await request(app)
        .get(`/services/banking_direct/v1/users/${userWithDaveBanking.id}/transactions`)
        .query(queryParams)
        .set('X-PLAID-CLIENT-ID', PLAID_CLIENT_ID)
        .set('X-PLAID-SECRET', PLAID_DIRECT_SECRET)
        .set('X-PLAID-AUTH-TOKEN', session.token)
        .set('X-PLAID-USER-ID', String(userWithDaveBanking.id))
        .expect(200);

      const defaultParams = {
        start: 1,
        limit: 500,
      };

      expect(stub).to.have.been.calledWith(
        mockedDaveBankingAccount.id,
        queryParams.start_date,
        queryParams.end_date,
        defaultParams.start,
        defaultParams.limit,
      );
    });
  });
});
