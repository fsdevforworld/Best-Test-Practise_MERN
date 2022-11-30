import { expect } from 'chai';
import { omit } from 'lodash';
import factory from '../../factories';
import { moment } from '@dave-inc/time-lib';
import {
  ExpectedTransaction as DBExpectedTransaction,
  RecurringTransaction as DBRecurringTransaction,
} from '../../../src/models';
import * as Store from '../../../src/domain/recurring-transaction/store';
import {
  ExpectedTransaction,
  RecurringTransaction,
} from '../../../src/domain/recurring-transaction/types';
import { RecurringTransactionStatus, TransactionType } from '../../../src/typings';
import { clean } from '../../test-helpers';

describe('recurring transaction store', () => {
  before(() => clean());
  afterEach(() => clean());

  async function buildRecurring(
    params: Partial<DBRecurringTransaction> = {},
  ): Promise<RecurringTransaction> {
    const dbRecurring = await factory.build('recurring-transaction', params);
    return Store.formatRecurringTransaction(dbRecurring);
  }

  describe('get by ID', () => {
    it('should find recurring transaction by id', async () => {
      const rt = await buildRecurring();
      const [inserted] = await Store.insert([rt]);

      const found = await Store.getById(inserted.id);
      expect(found.id).to.equal(inserted.id);
      expect(found.userId).to.equal(inserted.userId);
      expect(found.bankAccountId).to.equal(inserted.bankAccountId);
    });

    it('should not find recurring transaction by id with wrong bank account', async () => {
      const rt = await buildRecurring();
      const [inserted] = await Store.insert([rt]);

      const found = await Store.getById(inserted.id, inserted.bankAccountId + 10);
      expect(found).to.not.exist;
    });
  });

  describe('get by user', () => {
    it('should find all recurring transactions for a user', async () => {
      const bankAccount = await factory.create('bank-account');
      const rt0 = await buildRecurring({
        userId: bankAccount.userId,
        bankAccountId: bankAccount.id,
      });
      const rt1 = await buildRecurring({
        userId: bankAccount.userId,
        bankAccountId: bankAccount.id,
        missed: moment(),
      });
      const inserted = await Store.insert([rt0, rt1]);
      expect(inserted.length).to.equal(2);

      const userId = inserted[0].userId;
      const found = await Store.getByUser(userId);
      expect(found.length).to.equal(2);
      expect(found[0].userId).to.equal(userId);
      expect(found[1].userId).to.equal(userId);
    });
  });

  describe('get by user and type', () => {
    it('should find recurring transactions for a user by type', async () => {
      const bankAccount = await factory.create('bank-account');
      const rt0 = await buildRecurring({
        userId: bankAccount.userId,
        bankAccountId: bankAccount.id,
        type: TransactionType.INCOME,
      });
      //const userId = rt0.userId;
      const rt1 = await buildRecurring({
        userId: bankAccount.userId,
        bankAccountId: bankAccount.id,
        type: TransactionType.EXPENSE,
      });
      await Store.insert([rt0, rt1]);

      const found = await Store.getByUserAndType(bankAccount.userId, TransactionType.INCOME);
      expect(found.length).to.equal(1);
      expect(found[0].userId).to.equal(bankAccount.userId);
    });

    it('should include missed recurring transactions', async () => {
      const missed = await buildRecurring({
        type: TransactionType.INCOME,
        missed: moment(),
      });
      await Store.insert([missed]);

      const foundActive = await Store.getByUserAndType(missed.userId, TransactionType.INCOME);

      expect(foundActive.length).to.equal(0);

      const found = await Store.getByUserAndType(missed.userId, TransactionType.INCOME, true);

      expect(found.length).to.equal(1);
      expect(found[0].userId).to.equal(missed.userId);
      expect(found[0].userDisplayName).to.equal(missed.userDisplayName);
    });
  });

  describe('get user income by status', () => {
    it('should return user income filtered by given status', async () => {
      const user = await factory.create('user');
      const bankAccount = await factory.create('bank-account', { userId: user.id });
      const rt0 = await buildRecurring({
        userId: user.id,
        bankAccountId: bankAccount.id,
        userAmount: 1000,
        status: RecurringTransactionStatus.VALID,
      });
      const rt1 = await buildRecurring({
        userId: user.id,
        bankAccountId: bankAccount.id,
        userAmount: 1000,
        status: RecurringTransactionStatus.PENDING_VERIFICATION,
      });
      const rt2 = await buildRecurring({
        userId: user.id,
        bankAccountId: bankAccount.id,
        userAmount: 1000,
        status: RecurringTransactionStatus.INVALID_NAME,
      });

      const inserted = await Store.insert([rt0, rt1, rt2]);
      expect(inserted.length).to.equal(3);

      const result0 = await Store.getUserIncomesByStatus(user.id, bankAccount.id, [
        RecurringTransactionStatus.INVALID_NAME,
      ]);
      expect(result0.length).to.equal(1);
      expect(result0[0].status).to.equal(RecurringTransactionStatus.INVALID_NAME);

      const queryStatuses = [
        RecurringTransactionStatus.VALID,
        RecurringTransactionStatus.PENDING_VERIFICATION,
      ];
      const result1 = await Store.getUserIncomesByStatus(user.id, bankAccount.id, queryStatuses);
      expect(result1.length).to.equal(2);
      expect(queryStatuses).to.include(result1[0].status);
      expect(queryStatuses).to.include(result1[1].status);
    });
  });

  describe('get by bank account', () => {
    it('should find recurring transactions by bank account', async () => {
      const rt0 = await buildRecurring();
      await Store.insert([rt0]);

      const bankAccountId = rt0.bankAccountId;
      await factory.create('recurring-transaction', {
        userId: rt0.userId,
        bankAccountId,
      });

      const found = await Store.getByBankAccount(bankAccountId);
      expect(found.length).to.equal(2);
      expect(found[0].bankAccountId).to.equal(bankAccountId);
      expect(found[1].bankAccountId).to.equal(bankAccountId);
    });
  });

  describe('get by bank account including deleted', () => {
    it('should find recurring transactions including deleted by bank account', async () => {
      const rt = await buildRecurring();
      const [insertedRt] = await Store.insert([rt]);
      expect(insertedRt).to.exist;

      await Store.deleteById(insertedRt.id);
      const byId = await Store.getById(insertedRt.id);
      expect(byId, 'byId').to.not.exist;

      const [byBankAccount] = await Store.getByBankAccount(rt.bankAccountId);
      expect(byBankAccount, 'byBankAccount').to.not.exist;

      const includeDeletedResults = await Store.getByBankAccount(rt.bankAccountId, {
        includeDeleted: true,
      });
      expect(includeDeletedResults.length).to.equal(1);
      const [deletedRt] = includeDeletedResults;
      expect(deletedRt.bankAccountId).to.equal(rt.bankAccountId);
      expect(deletedRt.id).to.equal(insertedRt.id);
      expect(deletedRt.deleted.isBefore(moment())).to.be.true;
    });
  });

  describe('insert recurring transactions', () => {
    it('should return inserted recurring transactions', async () => {
      const rt0 = await buildRecurring();
      const rt1 = await buildRecurring();
      const inserted = await Store.insert([rt0, rt1]);
      expect(inserted.length).to.equal(2);
      expect(inserted[0].transactionDisplayName).to.equal(rt0.transactionDisplayName);
      expect(inserted[1].transactionDisplayName).to.equal(rt1.transactionDisplayName);
    });

    it('should ignore duplicate recurring transactions', async () => {
      const rt = await buildRecurring();
      await Store.insert([rt]);

      const duplicate = await buildRecurring({
        ...rt,
        userDisplayName: 'a different name',
      });
      const inserted = await Store.insert([duplicate]);
      expect(inserted.length).to.equal(0);

      const byBankAccount = await Store.getByBankAccount(rt.bankAccountId);
      expect(byBankAccount.length).to.equal(1);
      expect(byBankAccount[0].transactionDisplayName).to.equal(rt.transactionDisplayName);

      // Fields should not be updated
      expect(byBankAccount[0].userDisplayName).to.equal(rt.userDisplayName);
      expect(byBankAccount[0].userDisplayName).to.not.equal(duplicate.userDisplayName);
    });
  });

  describe('delete recurring transaction', () => {
    it('should delete recurring transaction', async () => {
      const rt = await buildRecurring();
      const [inserted] = await Store.insert([rt]);
      expect(inserted).to.exist;

      const result0 = await Store.getById(inserted.id);
      expect(result0).to.exist;

      await Store.deleteById(rt.id);

      const result1 = await Store.getById(rt.id);
      expect(result1).to.not.exist;
    });
  });

  async function buildExpected(
    params: Partial<DBExpectedTransaction> = {},
  ): Promise<ExpectedTransaction> {
    const dbExpected = await factory.build('expected-transaction', params);
    return Store.formatExpectedTransaction(dbExpected);
  }

  describe('insert expected transactions', () => {
    it('should return inserted expected transactions', async () => {
      const et0 = await buildExpected();
      const et1 = await buildExpected();

      const inserted = await Store.insertExpected([et0, et1]);
      expect(inserted.length).to.equal(2);
      expect(inserted[0].displayName).to.equal(et0.displayName);
      expect(inserted[1].displayName).to.equal(et1.displayName);
    });

    it('should ignore duplicate expected transactions', async () => {
      const rt = await factory.create('recurring-transaction');
      const et = await buildExpected({ recurringTransactionId: rt.id });

      await Store.insertExpected([et]);
      const inserted = await Store.insertExpected([et]);
      expect(inserted.length).to.equal(1);

      const byUser = await Store.getExpectedByUser(
        et.userId,
        moment().subtract(1, 'days'),
        moment(),
      );
      expect(byUser.length).to.equal(1);
      expect(byUser[0].displayName).to.equal(et.displayName);
    });
  });

  describe('upsert expected transactions', () => {
    it('should upsert expected transaction', async () => {
      const rt = await factory.create('recurring-transaction');
      const et = await buildExpected({
        settledAmount: 1000,
        recurringTransactionId: rt.id,
      });
      const [inserted] = await Store.insertExpected([et]);
      expect(inserted).to.exist;

      inserted.settledAmount = 1234;
      const upserted = await Store.upsertExpected(inserted);

      expect(upserted.id).to.equal(inserted.id);
      expect(upserted.settledAmount).to.equal(inserted.settledAmount);

      const result = await Store.getExpectedByUser(
        et.userId,
        moment().subtract(1, 'days'),
        moment(),
      );
      expect(result.length).to.equal(1);
      expect(result[0].settledAmount).to.equal(upserted.settledAmount);
    });

    it('should restore soft-deleted rows on upsert', async () => {
      const rt = await factory.create('recurring-transaction');
      const et = await buildExpected({
        settledAmount: 1000,
        recurringTransactionId: rt.id,
        expectedDate: moment(),
        deleted: moment().toDate(),
      });
      const [inserted] = await Store.insertExpected([et]);
      expect(inserted).to.not.be.null;

      // cannot fetch a deleted row
      const deletedExpected = await Store.getExpectedById(inserted.id);
      expect(deletedExpected).to.not.exist;

      const etNew: any = {
        ...omit(inserted, ['id', 'deleted']),
        settledAmount: 900,
      };
      const upserted = await Store.upsertExpected(etNew);
      expect(upserted).to.exist;
      expect(upserted.id).to.equal(inserted.id);
      expect(upserted.recurringTransactionId).to.equal(etNew.recurringTransactionId);
      expect(upserted.expectedDate.isSame(etNew.expectedDate, 'day')).to.be.true;
      expect(upserted.settledAmount).to.equal(900);

      const getResult = await Store.getExpectedById(upserted.id);
      expect(getResult).to.exist;
    });
  });

  describe('get expected transactions', () => {
    it('should get expected transactions by recurring transaction', async () => {
      const rt = await factory.create('recurring-transaction');
      const et0 = await buildExpected({
        recurringTransactionId: rt.id,
        expectedDate: moment(),
      });
      const et1 = await buildExpected({
        recurringTransactionId: rt.id,
        expectedDate: moment().subtract(1, 'days'),
      });

      await Store.insertExpected([et0, et1]);
      const result = await Store.getExpectedByRecurring(
        rt.id,
        moment().subtract(2, 'days'),
        moment(),
      );

      expect(result.length).to.equal(2);
      expect(result[0].recurringTransactionId).to.equal(rt.id);
      expect(result[0].expectedDate.isSame(et1.expectedDate, 'day'));
      expect(result[1].recurringTransactionId).to.equal(rt.id);
      expect(result[1].expectedDate.isSame(et0.expectedDate, 'day'));
    });

    it('should get expected transactions by user', async () => {
      const user = await factory.create('user');
      const et0 = await buildExpected({
        userId: user.id,
        expectedDate: moment(),
      });
      const et1 = await buildExpected({
        userId: user.id,
        expectedDate: moment().subtract(1, 'days'),
      });

      await Store.insertExpected([et0, et1]);
      const result = await Store.getExpectedByUser(user.id, moment().subtract(2, 'days'), moment());

      expect(result.length).to.equal(2);
      expect(result[0].userId).to.equal(user.id);
      expect(result[0].expectedDate.isSame(et1.expectedDate, 'day'));
      expect(result[1].userId).to.equal(user.id);
      expect(result[1].expectedDate.isSame(et0.expectedDate, 'day'));
    });

    it('should get expected expenses by user', async () => {
      const user = await factory.create('user');
      const income = await buildExpected({
        userId: user.id,
        expectedAmount: 1000,
      });
      const expense = await buildExpected({
        userId: user.id,
        expectedAmount: -200,
      });

      await Store.insertExpected([income, expense]);
      const result = await Store.getExpectedExpensesByUser(user.id);

      expect(result.length).to.equal(1);
      expect(result[0].userId).to.equal(user.id);
      expect(result[0].expectedAmount).to.equal(expense.expectedAmount);
    });

    it('should get expected expenses by user with limit', async () => {
      const user = await factory.create('user');
      const et0 = await buildExpected({
        userId: user.id,
        expectedAmount: -100,
      });
      const et1 = await buildExpected({
        userId: user.id,
        expectedAmount: -50,
      });
      const et2 = await buildExpected({
        userId: user.id,
        expectedAmount: -25,
      });
      await Store.insertExpected([et0, et1, et2]);
      const result = await Store.getExpectedExpensesByUser(user.id, { limit: 2 });

      expect(result.length).to.equal(2);
    });

    it('should get expected transactions by date', async () => {
      const rt = await factory.create('recurring-transaction');
      const et0 = await buildExpected({
        recurringTransactionId: rt.id,
        displayName: 'way later on',
        expectedDate: moment().add(10, 'days'),
      });
      const et1 = await buildExpected({
        recurringTransactionId: rt.id,
        displayName: 'later on',
        expectedDate: moment().add(5, 'days'),
      });

      await Store.insertExpected([et0, et1]);
      const result0 = await Store.getExpectedByDate(rt.id, et0.expectedDate);
      expect(result0.displayName).to.equal(et0.displayName);

      const result1 = await Store.getExpectedByDate(rt.id, et1.expectedDate);
      expect(result1.displayName).to.equal(et1.displayName);
    });

    it('should get most recent expected transactions', async () => {
      const rt = await factory.create('recurring-transaction');
      const et0 = await buildExpected({
        recurringTransactionId: rt.id,
        expectedDate: moment().subtract(20, 'days'),
      });
      const et1 = await buildExpected({
        recurringTransactionId: rt.id,
        expectedDate: moment().subtract(10, 'days'),
      });

      await Store.insertExpected([et0, et1]);
      const mostRecent = await Store.getMostRecentExpected(rt.id);

      expect(mostRecent).to.exist;
      expect(mostRecent.expectedDate.isSame(et1.expectedDate, 'day'));
    });
  });

  describe('update expected transaction', () => {
    it('should update expected transactions', async () => {
      const et = await buildExpected({
        displayName: 'pack of gum',
        expectedAmount: -1.0,
      });
      const [inserted] = await Store.insertExpected([et]);
      expect(inserted).to.exist;

      const updated = await Store.updateExpectedTransaction(inserted.id, {
        displayName: 'pack of dogs',
        expectedAmount: -2000,
      });

      expect(updated.displayName).to.equal('pack of dogs');
      expect(updated.expectedAmount).to.equal(-2000);
    });
  });

  describe('delete expected transactions', () => {
    it('should delete expected transactions by recurring transaction', async () => {
      const rt = await factory.create('recurring-transaction');
      const et0 = await buildExpected({
        recurringTransactionId: rt.id,
        expectedDate: moment(),
      });
      const et1 = await buildExpected({
        recurringTransactionId: rt.id,
        expectedDate: moment().subtract(5, 'days'),
      });

      const inserted = await Store.insertExpected([et0, et1]);
      expect(inserted.length).to.equal(2);

      const numDeleted = await Store.deleteExpectedByRecurring(rt.id);
      expect(numDeleted).to.equal(2);

      const results = await Store.getExpectedByRecurring(
        rt.id,
        moment().subtract(10, 'days'),
        moment(),
      );
      expect(results.length).to.equal(0);
    });
  });
});
