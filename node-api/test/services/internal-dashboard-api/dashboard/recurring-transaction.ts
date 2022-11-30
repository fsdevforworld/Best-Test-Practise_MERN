import * as request from 'supertest';
import * as sinon from 'sinon';
import { RecurringTransactionStatus, TransactionType } from '../../../../src/typings';
import app from '../../../../src/services/internal-dashboard-api';
import * as RecurringTransactionDomain from '../../../../src/domain/recurring-transaction';
import factory from '../../../factories';
import 'mocha';
import { expect } from 'chai';
import {
  clean,
  stubBalanceLogClient,
  stubBankTransactionClient,
  stubLoomisClient,
  up,
  withInternalUser,
} from '../../../test-helpers';
import { insertFixtureBankTransactions } from '../../../test-helpers/bank-transaction-fixtures';

describe('/dashboard/recurring_transaction/* endpoints', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  beforeEach(async () => {
    stubLoomisClient(sandbox);
    stubBankTransactionClient(sandbox);
    stubBalanceLogClient(sandbox);
    insertFixtureBankTransactions();
    await up();
  });

  afterEach(() => clean(sandbox));

  describe('GET /dashboard/recurring_transaction/:id', () => {
    it('should get all the recurring transactions for a user', async () => {
      const userId = 2200;
      const url = `/dashboard/user/${userId}/recurring_transaction`;

      const result = await withInternalUser(
        request(app)
          .get(url)
          .expect(200),
      );
      expect(result.body).to.be.an('array');
      expect(result.body[0].id).to.equal(userId);
      expect(result.body.length).to.equal(1);
    });

    it('should get all the required recurring transaction fields', async () => {
      const userId = 2200;
      const url = `/dashboard/user/${userId}/recurring_transaction`;

      const result = await withInternalUser(
        request(app)
          .get(url)
          .expect(200),
      );

      const recurringTransaction = result.body[0];
      expect(recurringTransaction.id).to.equal(2200);
      expect(recurringTransaction.userId).to.equal(2200);
      expect(recurringTransaction.bankAccountId).to.equal(2200);

      expect(recurringTransaction.userDisplayName).to.equal('Name 2200');
      expect(recurringTransaction.userAmount).to.equal(2200);

      expect(recurringTransaction.interval).to.equal('MONTHLY');
      expect(recurringTransaction.params).to.deep.equal([5]);
      expect(recurringTransaction.rollDirection).to.equal(0);
    });
  });

  describe('UPDATE /dashboard/recurring_transaction/:id', () => {
    it('should update a recurring transaction for a user', async () => {
      const id = 2200;
      const url = `/dashboard/recurring_transaction/${id}`;

      const data = {
        userDisplayName: 'SUSHI',
        userAmount: 49,
      };

      await withInternalUser(
        request(app)
          .patch(url)
          .send(data)
          .expect(200),
      );

      const transaction = await RecurringTransactionDomain.getById(id, id);
      expect(transaction.userDisplayName).to.equal(data.userDisplayName);
      expect(transaction.userAmount).to.equal(data.userAmount);
    });

    it('should return updated transaction parameters in response', async () => {
      const id = 2200;
      const url = `/dashboard/recurring_transaction/${id}`;

      const data = {
        userDisplayName: 'SUSHI',
        userAmount: 49,
      };

      const result = await withInternalUser(
        request(app)
          .patch(url)
          .send(data)
          .expect(200),
      );

      const transaction = await RecurringTransactionDomain.getById(id, id);

      expect(result.body.userDisplayName).to.equal(transaction.userDisplayName);
      expect(result.body.transactionDisplayName).to.equal(transaction.transactionDisplayName);
      expect(result.body.interval).to.equal(transaction.rsched.interval);
      expect(result.body.status).to.equal(transaction.status);
      expect(result.body.type).to.equal(transaction.type);
    });

    it('should fail if edit has invalid interval & param', async () => {
      const id = 2200;
      const url = `/dashboard/recurring_transaction/${id}`;

      const data = {
        interval: 'WEEKLY',
        params: [1],
      };

      const result = await withInternalUser(
        request(app)
          .patch(url)
          .send(data)
          .expect(400),
      );

      expect(result.body.type).to.equal('invalid_parameters');
      expect(result.body.message).to.include('params must be an array of lowercased weekdays');
    });
  });

  describe('DELETE /dashboard/recurring_transaction/:id', () => {
    it('should delete a recurring transaction for a user', async () => {
      const userId = 2200;
      const transactionId = 2200;
      const url = `/dashboard/recurring_transaction/${transactionId}`;

      await withInternalUser(
        request(app)
          .delete(url)
          .expect(200),
      );

      const transaction = await RecurringTransactionDomain.getByUser(userId);
      expect(transaction.length).to.equal(0);
    });

    it('should return a 404 if the recurring transaction doesnt exist', async () => {
      const transactionId = 220012;
      const url = `/dashboard/recurring_transaction/${transactionId}`;

      await withInternalUser(
        request(app)
          .delete(url)
          .expect(404),
      );
    });

    it('will throw an error when the bank account has been deleted', async () => {
      const transactionId = 2200;
      const url = `/dashboard/recurring_transaction/${transactionId}`;

      const transaction = await RecurringTransactionDomain.getById(transactionId);
      const bankAccount = await RecurringTransactionDomain.getBankAccount(transaction);
      await bankAccount.destroy();

      await withInternalUser(
        request(app)
          .delete(url)
          .expect(404),
      );
    });
  });

  describe('CREATE /dashboard/recurring_transaction/:id', () => {
    it('should create a recurring transaction for a user', async () => {
      const transaction = await factory.create('bank-transaction');

      const url = `/dashboard/user/${transaction.userId}/recurring_transaction`;
      const body = {
        bankTransactionId: transaction.id,
        bankAccountId: transaction.bankAccountId,
        userDisplayName: transaction.displayName,
        userAmount: transaction.amount,
        interval: 'MONTHLY',
        params: [10],
        rollDirection: 0,
      };

      await withInternalUser(
        request(app)
          .post(url)
          .send(body)
          .expect(200),
      );

      const [recurringTransaction] = await RecurringTransactionDomain.getByUser(transaction.userId);

      expect(recurringTransaction.transactionDisplayName).to.equal(transaction.displayName);
      expect(recurringTransaction.bankAccountId).to.equal(transaction.bankAccountId);
      expect(recurringTransaction.rsched.interval).to.equal(body.interval);
      expect(recurringTransaction.rsched.params[0]).to.equal(body.params[0]);
    });

    it('should return created transaction parameters in response', async () => {
      const transaction = await factory.create('bank-transaction');

      const url = `/dashboard/user/${transaction.userId}/recurring_transaction`;
      const body = {
        bankTransactionId: transaction.id,
        bankAccountId: transaction.bankAccountId,
        userDisplayName: transaction.displayName,
        userAmount: transaction.amount,
        interval: 'MONTHLY',
        params: [10],
        rollDirection: 0,
      };

      const result = await withInternalUser(
        request(app)
          .post(url)
          .send(body)
          .expect(200),
      );

      expect(result.body.userDisplayName).to.equal(body.userDisplayName);
      expect(result.body.transactionDisplayName).to.equal(body.userDisplayName);
      expect(result.body.interval).to.equal(body.interval);
      expect(result.body.status).to.equal(RecurringTransactionStatus.VALID);
      const transactionType =
        transaction.amount > 0 ? TransactionType.INCOME : TransactionType.EXPENSE;
      expect(result.body.type).to.equal(transactionType);
    });

    it('should fail if create a recurring transaction has invalid interval & param', async () => {
      const transaction = await factory.create('bank-transaction');

      const url = `/dashboard/user/${transaction.userId}/recurring_transaction`;
      const body = {
        bankTransactionId: transaction.id,
        bankAccountId: transaction.bankAccountId,
        userDisplayName: transaction.displayName,
        userAmount: transaction.amount,
        interval: 'MONTHLY',
        params: ['friday'],
      };

      const result = await withInternalUser(
        request(app)
          .post(url)
          .send(body)
          .expect(400),
      );

      expect(result.body.type).to.equal('invalid_parameters');
      expect(result.body.message).to.include('params should be array of integers with length 1');
    });

    it('should fail if create recurring transaction has invalid roll direction', async () => {
      const transaction = await factory.create('bank-transaction');

      const url = `/dashboard/user/${transaction.userId}/recurring_transaction`;
      const body = {
        bankTransactionId: transaction.id,
        bankAccountId: transaction.bankAccountId,
        userDisplayName: transaction.displayName,
        userAmount: transaction.amount,
        interval: 'MONTHLY',
        params: [4],
        rollDirection: 7,
      };

      const result = await withInternalUser(
        request(app)
          .post(url)
          .send(body)
          .expect(400),
      );

      expect(result.body.message).to.include('Roll direction must be an integer between -2 and 2');
    });
  });

  describe('GET /dashboard/recurring_transaction/:id/expected_transaction', () => {
    it('should get all expected transactions for a recurring transaction', async () => {
      const recurringTransaction = await factory.create('recurring-transaction', {
        interval: 'MONTHLY',
        params: [5],
      });

      const recurringTransactionId = recurringTransaction.id;

      const expectedTransaction = await factory.create('expected-transaction', {
        recurringTransactionId,
      });

      const url = `/dashboard/recurring_transaction/${recurringTransactionId}/expected_transaction`;
      const result = await withInternalUser(
        request(app)
          .get(url)
          .expect(200),
      );
      expect(result.body).to.be.an('array');
      expect(result.body.length).to.equal(1);

      const serializedExpectedTransaction = result.body[0];
      expect(serializedExpectedTransaction.recurringTransactionId).to.equal(recurringTransactionId);
      expect(serializedExpectedTransaction.id).to.eq(expectedTransaction.id);
      expect(serializedExpectedTransaction.expectedDate).to.match(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('throws a not found error when the Recurring transaction does not exist', async () => {
      const recurringTransactionId = 0;

      const url = `/dashboard/recurring_transaction/${recurringTransactionId}/expected_transaction`;
      await withInternalUser(
        request(app)
          .get(url)
          .expect(404),
      );
    });
  });
});
