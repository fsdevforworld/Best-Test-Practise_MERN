import * as request from 'supertest';
import * as sinon from 'sinon';
import app from '../../../src/api';
import bankTransactionSchema from '../../schema/bank-transaction';
import 'mocha';
import { expect } from 'chai';
import 'chai-json-schema';
import { clean, stubBankTransactionClient, up } from '../../test-helpers';
import factory from '../../factories';
import { moment } from '@dave-inc/time-lib';
import { insertFixtureBankTransactions } from '../../test-helpers/bank-transaction-fixtures';

describe('/v2/bank_account/id/{incomes|expenses|transactions}', () => {
  const sandbox = sinon.createSandbox();

  // clean everything before we start
  before(() => clean());

  // insert user and user_session data
  beforeEach(() => {
    stubBankTransactionClient(sandbox);
    insertFixtureBankTransactions();
    return up();
  });

  //truncate user and user_session data
  afterEach(() => clean(sandbox));

  describe('GET /bank_account/:id/expenses', () => {
    it('should throw a NotFoundError if trying to get txns for an account for another user', async () => {
      const result = await request(app)
        .get('/v2/bank_account/1/expenses')
        .set('Authorization', 'token-1100')
        .set('X-Device-Id', 'id-1100');

      expect(result.status).to.equal(404);
    });

    it('should get the transactions for the account', async () => {
      const result = await request(app)
        .get('/v2/bank_account/1100/expenses')
        .set('Authorization', 'token-1100')
        .set('X-Device-Id', 'id-1100');

      expect(result.status).to.equal(200);
      expect(result.body).to.be.jsonSchema(bankTransactionSchema);
      expect(result.body.length).to.equal(2);
      expect(result.body[0].id).to.equal(1104);
      expect(result.body[1].id).to.equal(1100);
    });

    it('should hide the error and return 200 if fetch fails', async () => {
      await request(app)
        .get('/v2/bank_account/1100/expenses')
        .set('Authorization', 'token-1100')
        .set('X-Device-Id', 'id-1100')
        .expect(200);
    });

    it('should include $1 transactions for most users', async () => {
      const user = await factory.create('user');
      const bankConnection = await factory.create('bank-connection', { userId: user.id });
      const bankAccount = await factory.create('checking-account', {
        bankConnectionId: bankConnection.id,
        userId: user.id,
      });
      const transaction = await factory.create('bank-transaction', {
        transactionDate: moment(),
        bankAccountId: bankAccount.id,
        userId: user.id,
        displayName: 'Jeff ATM Something',
        amount: -1,
      });

      const result = await request(app)
        .get(`/v2/bank_account/${transaction.bankAccountId}/expenses`)
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id);

      expect(result.status).to.equal(200);
      expect(result.body).to.be.jsonSchema(bankTransactionSchema);
      expect(result.body.length).to.equal(1);
      expect(result.body[0].id).to.equal(transaction.id);
      expect(result.body[0].amount).to.equal(-1);
      expect(result.body[0].isSupportedIncome).to.be.false;
    });
  });

  describe('GET /bank_account/:id/incomes', () => {
    it('should throw a NotFoundError if trying to get txns for an account for another user', async () => {
      const result = await request(app)
        .get('/v2/bank_account/1/incomes')
        .set('Authorization', 'token-1100')
        .set('X-Device-Id', 'id-1100');

      expect(result.status).to.equal(404);
    });

    it('should get the transactions for the account', async () => {
      const result = await request(app)
        .get('/v2/bank_account/1100/incomes')
        .set('Authorization', 'token-1100')
        .set('X-Device-Id', 'id-1100');

      expect(result.status).to.equal(200);
      expect(result.body).to.be.jsonSchema(bankTransactionSchema);
      expect(result.body.length).to.equal(1);
      expect(result.body[0].id).to.equal(1102);
    });

    it('it should return a unsupported income', async () => {
      const user = await factory.create('user');
      const bankConnection = await factory.create('bank-connection', { userId: user.id });
      const bankAccount = await factory.create('checking-account', {
        bankConnectionId: bankConnection.id,
        userId: user.id,
      });
      const transaction = await factory.create('bank-transaction', {
        transactionDate: moment(),
        bankAccountId: bankAccount.id,
        userId: user.id,
        displayName: 'Jeff ATM Something',
        amount: 300,
      });

      const result = await request(app)
        .get(`/v2/bank_account/${bankAccount.id}/incomes`)
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id);

      expect(result.status).to.equal(200);
      expect(result.body).to.be.jsonSchema(bankTransactionSchema);
      expect(result.body.length).to.equal(1);
      expect(result.body[0].id).to.equal(transaction.id);
      expect(result.body[0].amount).to.eq(300);
      expect(result.body[0].isSupportedIncome).to.be.false;
    });
  });

  describe('GET /bank_account/:id/transactions', () => {
    it('should throw a NotFoundError if trying to get txns for an account for another user', async () => {
      const result = await request(app)
        .get('/v2/bank_account/1/transactions')
        .set('Authorization', 'token-1100')
        .set('X-Device-Id', 'id-1100');

      expect(result.status).to.equal(404);
    });

    it('should get the transactions for the account', async () => {
      const result = await request(app)
        .get('/v2/bank_account/1100/transactions')
        .set('Authorization', 'token-1100')
        .set('X-Device-Id', 'id-1100');

      expect(result.status).to.equal(200);
      expect(result.body).to.be.jsonSchema(bankTransactionSchema);
      expect(result.body.length).to.equal(3);
      expect(result.body[0].id).to.equal(1104);
      expect(result.body[1].id).to.equal(1100);
      expect(result.body[2].id).to.equal(1102);
    });

    it('should return a transaction that is supported income', async () => {
      const user = await factory.create('user');
      const bankConnection = await factory.create('bank-connection', { userId: user.id });
      const bankAccount = await factory.create('checking-account', {
        bankConnectionId: bankConnection.id,
        userId: user.id,
      });
      const transaction = await factory.create('bank-transaction', {
        transactionDate: moment(),
        bankAccountId: bankAccount.id,
        userId: user.id,
        displayName: 'Jeff Totally Legit Response',
        amount: 300,
      });

      const result = await request(app)
        .get(`/v2/bank_account/${bankAccount.id}/transactions`)
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id);

      expect(result.status).to.equal(200);
      expect(result.body).to.be.jsonSchema(bankTransactionSchema);
      expect(result.body.length).to.equal(1);
      expect(result.body[0].id).to.equal(transaction.id);
      expect(result.body[0].amount).to.eq(300);
      expect(result.body[0].isSupportedIncome).to.be.true;
    });
  });

  describe('GET /bank_account/:bankAccountId/transactions/:transactionId', () => {
    it('should throw a NotFoundError if trying to get txn for an account for another user', async () => {
      const result = await request(app)
        .get(`/v2/bank_account/1100/transactions/1100`)
        .set('Authorization', 'token-1000')
        .set('X-Device-Id', 'id-1000');
      expect(result.status).to.equal(404);
    });
    it('should transaction by id', async () => {
      const result = await request(app)
        .get(`/v2/bank_account/1100/transactions/1100`)
        .set('Authorization', 'token-1100')
        .set('X-Device-Id', 'id-1100');
      expect(result.status).to.equal(200);
      expect(result.body.displayName).to.equal('Name 1100');
    });
  });
});
