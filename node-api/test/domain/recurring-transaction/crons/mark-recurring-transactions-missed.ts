import * as sinon from 'sinon';
import { sequelize } from '../../../../src/models';
import {
  findMatchingBankTransaction,
  markRecurringTransactionsAsMissed,
  streamOverdueExpectedIncome,
  updateExpenses,
} from '../../../../src/domain/recurring-transaction/crons/mark-recurring-transactions-missed';
import Notifications from '../../../../src/domain/recurring-transaction/notifications';
import { moment } from '@dave-inc/time-lib';
import { serializeDate } from '../../../../src/serialization';
import { BankAccount, ExpectedTransaction, RecurringTransaction } from '../../../../src/models';
import { ExpectedTransactionStatus } from '../../../../src/models/expected-transaction';
import 'mocha';
import { expect } from 'chai';
import { clean, up } from '../../../test-helpers';
import factory from '../../../factories';
import braze from '../../../../src/lib/braze';
import { QueryTypes } from 'sequelize';
import { RecurringTransactionStatus, TransactionType } from '../../../../src/typings';
import { RecurringTransactionInterval } from '@dave-inc/wire-typings';
import stubBankTransactionClient from '../../../test-helpers/stub-bank-transaction-client';

describe('Task Mark Recurring transactions as missed', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  beforeEach(() => {
    stubBankTransactionClient(sandbox);
  });

  afterEach(() => clean(sandbox));

  function createTestRecurringTransaction(overrides?: Partial<RecurringTransaction>) {
    return RecurringTransaction.create({
      bankAccountId: 108,
      userId: 100,
      transactionDisplayName: 'WOWee shrimp ach cows dep',
      userAmount: 200,
      interval: RecurringTransactionInterval.BIWEEKLY,
      status: RecurringTransactionStatus.VALID,
      params: [
        moment()
          .subtract(3, 'days')
          .format('dddd')
          .toLowerCase(),
      ],
      dtstart: moment().subtract(3, 'days'),
      missed: null,
      userDisplayName: 'Test User Supplied',
      ...overrides,
    });
  }

  describe('mark incomes as missed', () => {
    beforeEach(() => up());

    it('should mark recurring transaction as missed', async () => {
      const query = 'SELECT id, missed, user_amount FROM recurring_transaction WHERE id = 106';
      const [recurring]: any[] = await sequelize.query(query, { type: QueryTypes.SELECT });
      expect(recurring.missed).to.be.null;
      await markRecurringTransactionsAsMissed();
      const [updated]: any[] = await sequelize.query(query, { type: QueryTypes.SELECT });
      expect(updated.missed.format('YYYY-MM-DD')).to.equal(moment().format('YYYY-MM-DD'));
    });

    it('should not update if missed more than two months ago', async () => {
      const recurring = await RecurringTransaction.findByPk(106);
      expect(recurring.missed).to.be.null;
      const missed = moment().subtract(65, 'days');
      await recurring.update({ missed });
      await markRecurringTransactionsAsMissed();
      const updated = await RecurringTransaction.findByPk(106);
      expect(updated.missed.format('YYYY-MM-DD')).to.equal(missed.format('YYYY-MM-DD'));
    });

    it('should not update if expected is due yesterday', async () => {
      const recurring: RecurringTransaction = await factory.create('recurring-transaction');
      await factory.create('expected-transaction', {
        userDisplayName: 'Name 106',
        recurringTransactionId: recurring.id,
        expectedDate: moment().subtract(1, 'day'),
        expectedAmount: 300,
        status: 'PREDICTED',
        settledDate: null,
      });
      expect(recurring.missed).to.be.null;
      await markRecurringTransactionsAsMissed();
      const updated = await RecurringTransaction.findByPk(recurring.id);
      expect(updated.missed).to.be.null;
    });

    it('should not mark ok recurring transaction as missed', async () => {
      const query = 'SELECT id, missed FROM recurring_transaction WHERE id = 120';
      const [recurring]: any[] = await sequelize.query(query, { type: QueryTypes.SELECT });
      expect(recurring.missed).to.be.null;
      await markRecurringTransactionsAsMissed();
      const [updated]: any[] = await sequelize.query(query, { type: QueryTypes.SELECT });
      expect(updated.missed).to.be.null;
    });

    it('should work with a partial match on names', async () => {
      const rec = await createTestRecurringTransaction();
      const ex = await ExpectedTransaction.create({
        userId: 100,
        bankAccountId: 108,
        pendingDisplayName: 'Test',
        displayName: 'This cool display Name',
        expectedAmount: 200,
        status: 'PREDICTED',
        expectedDate: moment().subtract(3, 'days'),
        recurringTransactionId: rec.id,
      });
      const newName = 'cows Wowee shrimp-payroll';
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: newName,
        externalName: 'Test',
        displayName: newName,
        amount: 200,
        transactionDate: moment()
          .subtract(3, 'day')
          .format('YYYY-MM-DD'),
        pending: false,
      });
      await markRecurringTransactionsAsMissed();
      const updated = await RecurringTransaction.findByPk(rec.id);
      expect(updated.missed).to.be.null;
      expect(updated.transactionDisplayName).to.equal(newName);
      expect(updated.possibleNameChange).to.equal(rec.transactionDisplayName);
      const updatedExpected = await ExpectedTransaction.findByPk(ex.id);
      expect(updatedExpected.settledAmount).to.equal(200);
      expect(updatedExpected.settledDate.format('YYYY-MM-DD')).to.equal(
        moment()
          .subtract(3, 'days')
          .format('YYYY-MM-DD'),
      );
    });

    it('should work with a partial match on names splitting ', async () => {
      const rec = await createTestRecurringTransaction();
      const ex = await ExpectedTransaction.create({
        userId: 100,
        bankAccountId: 108,
        pendingDisplayName: 'Test',
        displayName: 'This cool display Name',
        expectedAmount: 200,
        status: 'PREDICTED',
        expectedDate: moment().subtract(3, 'days'),
        recurringTransactionId: rec.id,
      });
      const newName = 'cows Wowee shrimp-payroll';
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: newName,
        externalName: 'Test',
        displayName: newName,
        amount: 200,
        transactionDate: moment()
          .subtract(3, 'day')
          .format('YYYY-MM-DD'),
        pending: false,
      });
      await markRecurringTransactionsAsMissed();
      const updated = await RecurringTransaction.findByPk(rec.id);
      expect(updated.missed).to.be.null;
      expect(updated.transactionDisplayName).to.equal(newName);
      expect(updated.possibleNameChange).to.equal(rec.transactionDisplayName);
      const updatedExpected = await ExpectedTransaction.findByPk(ex.id);
      expect(updatedExpected.settledAmount).to.equal(200);
      expect(updatedExpected.settledDate.format('YYYY-MM-DD')).to.equal(
        moment()
          .subtract(3, 'days')
          .format('YYYY-MM-DD'),
      );
    });

    it('should match a transaction with a partial match and date change', async () => {
      const rec = await createTestRecurringTransaction();
      const ex = await ExpectedTransaction.create({
        userId: 100,
        bankAccountId: 108,
        pendingDisplayName: 'Test',
        displayName: 'This cool display Name',
        expectedAmount: 200,
        status: 'PREDICTED',
        expectedDate: moment().subtract(3, 'days'),
        recurringTransactionId: rec.id,
      });
      const newName = 'cows Wowee shrimp-payroll';
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: newName,
        externalName: 'Test',
        displayName: newName,
        amount: 200,
        transactionDate: moment()
          .subtract(7, 'day')
          .format('YYYY-MM-DD'),
        pending: false,
      });
      await markRecurringTransactionsAsMissed();
      const updated = await RecurringTransaction.findByPk(rec.id);
      expect(updated.missed).to.be.null;
      expect(updated.transactionDisplayName).to.equal(newName);
      expect(updated.possibleNameChange).to.equal(rec.transactionDisplayName);
      const updatedExpected = await ExpectedTransaction.findByPk(ex.id);
      expect(updatedExpected.settledAmount).to.equal(200);
      expect(updatedExpected.settledDate.format('YYYY-MM-DD')).to.equal(
        moment()
          .subtract(7, 'days')
          .format('YYYY-MM-DD'),
      );
    });

    it('should match a transaction with only an amount match by the expected amount', async () => {
      const rec = await createTestRecurringTransaction();
      const ex = await ExpectedTransaction.create({
        userId: 100,
        bankAccountId: 108,
        pendingDisplayName: 'Test',
        displayName: 'This cool display Name',
        expectedAmount: 1000,
        status: 'PREDICTED',
        expectedDate: moment().subtract(3, 'days'),
        recurringTransactionId: rec.id,
      });
      const newName = 'this name does not match at all';
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: newName,
        externalName: 'Test',
        displayName: newName,
        amount: 1005,
        transactionDate: moment()
          .subtract(7, 'day')
          .format('YYYY-MM-DD'),
        pending: false,
      });
      await markRecurringTransactionsAsMissed();
      const updated = await RecurringTransaction.findByPk(rec.id);
      expect(updated.missed).to.be.null;
      expect(updated.transactionDisplayName).to.equal(newName);
      expect(updated.possibleNameChange).to.equal(rec.transactionDisplayName);
      const updatedExpected = await ExpectedTransaction.findByPk(ex.id);
      expect(updatedExpected.settledAmount).to.equal(1005);
      expect(updatedExpected.settledDate.format('YYYY-MM-DD')).to.equal(
        moment()
          .subtract(7, 'days')
          .format('YYYY-MM-DD'),
      );
    });

    it('should match a transaction with only and choose the closest transaction to the amount', async () => {
      const rec = await createTestRecurringTransaction();
      await ExpectedTransaction.create({
        userId: 100,
        bankAccountId: 108,
        pendingDisplayName: 'Test',
        displayName: 'This cool display Name',
        expectedAmount: 1000,
        status: 'PREDICTED',
        expectedDate: moment().subtract(3, 'days'),
        recurringTransactionId: rec.id,
      });
      const newName = 'this is a winner';
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: 'bad guy',
        externalName: 'Test',
        displayName: newName,
        amount: 1005,
        transactionDate: moment()
          .subtract(7, 'day')
          .format('YYYY-MM-DD'),
        pending: false,
      });
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: newName,
        externalName: 'Test',
        displayName: newName,
        amount: 1001,
        transactionDate: moment()
          .subtract(7, 'day')
          .format('YYYY-MM-DD'),
        pending: false,
      });
      await markRecurringTransactionsAsMissed();
      const updated = await RecurringTransaction.findByPk(rec.id);
      expect(updated.missed).to.be.null;
      expect(updated.transactionDisplayName).to.equal(newName);
      expect(updated.possibleNameChange).to.equal(rec.transactionDisplayName);
    });

    it('should match a transaction with only an amount match by the last transaction amount', async () => {
      const rec = await createTestRecurringTransaction();
      const ex = await ExpectedTransaction.create({
        userId: 100,
        bankAccountId: 108,
        pendingDisplayName: 'Test',
        displayName: 'This cool display Name',
        expectedAmount: 200,
        status: 'PREDICTED',
        expectedDate: moment().subtract(3, 'days'),
        recurringTransactionId: rec.id,
      });
      const newName = 'this name does not match at all';
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: `${newName}-1`,
        externalName: 'Test',
        displayName: rec.transactionDisplayName,
        amount: 1000,
        transactionDate: moment()
          .subtract(17, 'day')
          .format('YYYY-MM-DD'),
        pending: false,
      });
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: `${newName}-2`,
        externalName: 'Test',
        displayName: newName,
        amount: 1005,
        transactionDate: moment()
          .subtract(7, 'day')
          .format('YYYY-MM-DD'),
        pending: false,
      });
      await markRecurringTransactionsAsMissed();
      const updated = await RecurringTransaction.findByPk(rec.id);
      expect(updated.missed).to.be.null;
      expect(updated.transactionDisplayName).to.equal(newName);
      expect(updated.possibleNameChange).to.equal(rec.transactionDisplayName);
      const updatedExpected = await ExpectedTransaction.findByPk(ex.id);
      expect(updatedExpected.settledAmount).to.equal(1005);
      expect(updatedExpected.settledDate.format('YYYY-MM-DD')).to.equal(
        moment()
          .subtract(7, 'days')
          .format('YYYY-MM-DD'),
      );
    });

    it('should not crash if transaction display name is null', async () => {
      const rec = await createTestRecurringTransaction({ transactionDisplayName: null });
      await ExpectedTransaction.create({
        userId: 100,
        bankAccountId: 108,
        pendingDisplayName: 'Test',
        displayName: 'This cool display Name',
        expectedAmount: 200,
        status: 'PREDICTED',
        expectedDate: moment().subtract(3, 'days'),
        recurringTransactionId: rec.id,
      });
      const newName = 'cows Wowee shrimp-payroll';
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: newName,
        externalName: 'Test',
        displayName: newName,
        amount: 200,
        transactionDate: moment()
          .subtract(3, 'day')
          .format('YYYY-MM-DD'),
        pending: false,
      });
      await markRecurringTransactionsAsMissed();
      const updated = await RecurringTransaction.findByPk(rec.id);
      expect(updated.missed).to.be.null;
    });

    it('should set pending name with partial match', async () => {
      const rec = await createTestRecurringTransaction();
      const ex = await ExpectedTransaction.create({
        userId: 100,
        bankAccountId: 108,
        pendingDisplayName: 'Test',
        displayName: 'This cool display Name',
        expectedAmount: 200,
        status: 'PREDICTED',
        expectedDate: moment().subtract(3, 'days'),
        recurringTransactionId: rec.id,
      });
      const newName = 'cows Wowee shrimp-payroll';
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: newName,
        externalName: 'Test',
        displayName: newName,
        amount: 200,
        transactionDate: moment()
          .subtract(3, 'day')
          .format('YYYY-MM-DD'),
        pending: true,
      });
      await markRecurringTransactionsAsMissed();
      const updated = await RecurringTransaction.findByPk(rec.id);
      expect(updated.missed).to.be.null;
      expect(updated.pendingDisplayName).to.equal(newName);
      expect(updated.possibleNameChange).to.be.null;
      const updatedExpected = await ExpectedTransaction.findByPk(ex.id);
      expect(updatedExpected.pendingAmount).to.equal(200);
      expect(serializeDate(updatedExpected.pendingDate, 'YYYY-MM-DD')).to.equal(
        moment()
          .subtract(3, 'days')
          .format('YYYY-MM-DD'),
      );
    });

    it('should unset missed status on match found', async () => {
      const rec = await createTestRecurringTransaction({
        missed: moment().subtract(3, 'days'),
      });
      const ex = await ExpectedTransaction.create({
        userId: 100,
        bankAccountId: 108,
        pendingDisplayName: 'Test',
        displayName: 'This cool display Name',
        expectedAmount: 200,
        status: 'PREDICTED',
        expectedDate: moment().subtract(3, 'days'),
        recurringTransactionId: rec.id,
      });
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalName: 'Test',
        displayName: ex.displayName,
        amount: 200,
        transactionDate: moment()
          .subtract(3, 'day')
          .format('YYYY-MM-DD'),
        pending: false,
      });
      await markRecurringTransactionsAsMissed();
      const updated = await RecurringTransaction.findByPk(rec.id);
      expect(updated.missed).to.be.null;
    });

    it('should unset missed status on pending match found', async () => {
      const rec = await createTestRecurringTransaction({
        missed: moment().subtract(3, 'days'),
      });
      const ex = await ExpectedTransaction.create({
        userId: 100,
        bankAccountId: 108,
        pendingDisplayName: 'Test',
        displayName: 'This cool display Name',
        expectedAmount: 200,
        status: 'PREDICTED',
        expectedDate: moment().subtract(3, 'days'),
        recurringTransactionId: rec.id,
      });
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: ex.displayName,
        externalName: 'Test',
        displayName: ex.displayName,
        amount: 200,
        transactionDate: moment()
          .subtract(3, 'day')
          .format('YYYY-MM-DD'),
        pending: true,
      });
      await markRecurringTransactionsAsMissed();
      const updated = await RecurringTransaction.findByPk(rec.id);
      expect(updated.pendingDisplayName).to.equal(ex.displayName);
      expect(updated.missed).to.be.null;
    });

    it('should unset missed status on partial match found', async () => {
      const rec = await createTestRecurringTransaction({
        missed: moment().subtract(3, 'days'),
      });
      await ExpectedTransaction.create({
        userId: 100,
        bankAccountId: 108,
        pendingDisplayName: 'Test',
        displayName: 'This cool display Name',
        expectedAmount: 200,
        status: 'PREDICTED',
        expectedDate: moment().subtract(3, 'days'),
        recurringTransactionId: rec.id,
        missed: moment()
          .subtract(7, 'day')
          .format('YYYY-MM-DD'),
      });
      const newName = 'cows Wowee shrimp-payroll';
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: newName,
        externalName: 'Test',
        displayName: newName,
        amount: 200,
        transactionDate: moment()
          .subtract(7, 'day')
          .format('YYYY-MM-DD'),
        pending: false,
      });
      await markRecurringTransactionsAsMissed();
      const updated = await RecurringTransaction.findByPk(rec.id);
      expect(updated.missed).to.be.null;
      expect(updated.transactionDisplayName).to.equal(newName);
      expect(updated.possibleNameChange).to.equal(rec.transactionDisplayName);
    });

    it('should mark missed if a conflict occurs', async () => {
      const newName = 'cows Wowee shrimp-payroll';
      const rec = await createTestRecurringTransaction();
      await createTestRecurringTransaction({ transactionDisplayName: newName });
      await ExpectedTransaction.create({
        userId: 100,
        bankAccountId: 108,
        pendingDisplayName: 'Test',
        displayName: 'This cool display Name',
        expectedAmount: 200,
        status: 'PREDICTED',
        expectedDate: moment().subtract(3, 'days'),
        recurringTransactionId: rec.id,
      });
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: newName,
        externalName: 'Test',
        displayName: newName,
        amount: 200,
        transactionDate: moment()
          .subtract(3, 'day')
          .format('YYYY-MM-DD'),
        pending: false,
      });
      await markRecurringTransactionsAsMissed();
      const updated = await RecurringTransaction.findByPk(rec.id);
      expect(updated.missed).not.to.be.null;
    });

    it('should not match if name is off too much', async () => {
      const rec = await createTestRecurringTransaction();
      await ExpectedTransaction.create({
        userId: 100,
        bankAccountId: 108,
        pendingDisplayName: 'Test',
        displayName: 'This cool display Name',
        expectedAmount: 200,
        status: 'PREDICTED',
        expectedDate: moment().subtract(3, 'days'),
        recurringTransactionId: rec.id,
      });
      const newName = 'donkey Woweee shrimp-payroll';
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: newName,
        externalName: 'Test',
        displayName: newName,
        amount: 250,
        transactionDate: moment()
          .subtract(3, 'day')
          .format('YYYY-MM-DD'),
        pending: false,
      });
      await markRecurringTransactionsAsMissed();
      const updated = await RecurringTransaction.findByPk(rec.id);
      expect(updated.missed).not.to.be.null;
    });

    it('should work with a partial match on names if amount is off', async () => {
      const rec = await createTestRecurringTransaction();
      const ex = await ExpectedTransaction.create({
        userId: 100,
        bankAccountId: 108,
        pendingDisplayName: 'Test',
        displayName: 'This cool display Name',
        expectedAmount: 400,
        status: 'PREDICTED',
        expectedDate: moment().subtract(3, 'days'),
        recurringTransactionId: rec.id,
      });
      const newName = 'cows Wowee shrimp-payroll';
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: newName,
        externalName: 'Test',
        displayName: newName,
        amount: 300,
        transactionDate: moment()
          .subtract(3, 'day')
          .format('YYYY-MM-DD'),
        pending: false,
      });
      await markRecurringTransactionsAsMissed();
      const updated = await RecurringTransaction.findByPk(rec.id);
      expect(updated.missed).to.be.null;
      expect(updated.transactionDisplayName).to.equal(newName);
      const updatedExpected = await ExpectedTransaction.findByPk(ex.id);
      expect(updatedExpected.settledAmount).to.equal(300);
      expect(updatedExpected.settledDate.format('YYYY-MM-DD')).to.equal(
        moment()
          .subtract(3, 'days')
          .format('YYYY-MM-DD'),
      );
    });

    it('should match below $200 if the income had a low expected', async () => {
      const rec = await createTestRecurringTransaction();
      const ex = await ExpectedTransaction.create({
        userId: 100,
        bankAccountId: 108,
        pendingDisplayName: 'Test',
        displayName: 'This cool display Name',
        expectedAmount: 200,
        status: 'PREDICTED',
        expectedDate: moment().subtract(3, 'days'),
        recurringTransactionId: rec.id,
      });
      const newName = 'cows Wowee shrimp-payroll';
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: newName,
        externalName: 'Test',
        displayName: newName,
        amount: 160,
        transactionDate: moment()
          .subtract(3, 'day')
          .format('YYYY-MM-DD'),
        pending: false,
      });
      await markRecurringTransactionsAsMissed();
      const updated = await RecurringTransaction.findByPk(rec.id);
      expect(updated.missed).to.be.null;
      expect(updated.transactionDisplayName).to.equal(newName);
      const updatedExpected = await ExpectedTransaction.findByPk(ex.id);
      expect(updatedExpected.settledAmount).to.equal(160);
      expect(updatedExpected.settledDate.format('YYYY-MM-DD')).to.equal(
        moment()
          .subtract(3, 'days')
          .format('YYYY-MM-DD'),
      );
    });

    it('should not mark a week old transaction as missed', async () => {
      const rec = await createTestRecurringTransaction();
      await ExpectedTransaction.create({
        userId: 100,
        bankAccountId: 108,
        pendingDisplayName: 'Test',
        displayName: 'WOWee shrimp ach cows dep',
        expectedAmount: 400,
        status: 'SETTLED',
        expectedDate: moment(),
        settledDate: moment(),
        recurringTransactionId: rec.id,
      });
      await ExpectedTransaction.create({
        userId: 100,
        bankAccountId: 108,
        pendingDisplayName: 'Test',
        displayName: 'WOWee shrimp ach cows dep',
        expectedAmount: 400,
        status: 'PENDING',
        expectedDate: moment().subtract(1, 'week'),
        recurringTransactionId: rec.id,
      });
      await markRecurringTransactionsAsMissed();
      const updated = await RecurringTransaction.findByPk(rec.id);
      expect(updated.missed).to.be.null;
    });

    it('should work not work if the amount is off too much', async () => {
      const rec = await createTestRecurringTransaction();
      await ExpectedTransaction.create({
        userId: 100,
        bankAccountId: 108,
        pendingDisplayName: 'Test',
        displayName: 'This cool display Name',
        expectedAmount: 1000,
        status: 'PREDICTED',
        expectedDate: moment().subtract(3, 'days'),
        recurringTransactionId: rec.id,
      });
      const newName = 'cows Wowee shrimp-payroll';
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: newName,
        externalName: 'Test',
        displayName: newName,
        amount: 300,
        transactionDate: moment()
          .subtract(3, 'day')
          .format('YYYY-MM-DD'),
        pending: false,
      });
      await markRecurringTransactionsAsMissed();
      const updated = await RecurringTransaction.findByPk(rec.id);
      expect(updated.missed).not.to.be.null;
    });

    it('should not update missed status if already set', async () => {
      const rec = await createTestRecurringTransaction({ missed: moment().subtract(10, 'days') });
      await ExpectedTransaction.create({
        userId: 100,
        bankAccountId: 108,
        pendingDisplayName: 'Test',
        displayName: 'This cool display Name',
        expectedAmount: 1000,
        status: 'PREDICTED',
        expectedDate: moment().subtract(3, 'days'),
        recurringTransactionId: rec.id,
      });
      await markRecurringTransactionsAsMissed();
      const updated = await RecurringTransaction.findByPk(rec.id);
      expect(updated.missed).to.not.be.null;
      expect(updated.missed.isBefore(moment())).to.be.true;
      expect(updated.missed.isSame(rec.missed, 'day')).to.be.true;
    });
  });

  describe('findMatchingBankTransaction', () => {
    beforeEach(() => up());

    it('should not match an already matched transaction', async () => {
      const recurring = await factory.create('recurring-transaction', {
        transactionDisplayName: 'double match test',
        interval: RecurringTransactionInterval.WEEKLY,
        params: ['wednesday'],
        userAmount: 100,
        bankAccountId: 1400,
        userId: 1400,
      });
      const expectedMissed = await factory.create('expected-paycheck', {
        recurringTransactionId: recurring.id,
        expectedDate: moment('2019-12-11'),
        expectedAmount: 100,
        bankAccountId: recurring.bankAccountId,
        userId: recurring.userId,
      });
      const bankTransaction = await factory.create('bank-transaction', {
        id: 1400,
        transactionDate: moment('2019-12-09'),
        displayName: 'double match test',
        amount: 100,
        bankAccountId: expectedMissed.bankAccountId,
      });

      expectedMissed.recurringTransaction = recurring;
      const result0 = await findMatchingBankTransaction(expectedMissed);
      expect(result0).to.not.be.undefined;
      expect(result0.id).to.equal(bankTransaction.id);

      // Insert an earlier expected transaction that matches the same
      // bank transaction. This should pre-empt matching expectedMissed
      await factory.create('expected-paycheck', {
        expectedDate: moment('2019-12-04'),
        status: ExpectedTransactionStatus.SETTLED,
        recurringTransactionId: recurring.id,
        bankTransactionId: bankTransaction.id,
      });
    });
  });

  describe('streamOverdueExpectedIncome', () => {
    it('should include weekly recurring transactions missed within the last two weeks', async () => {
      const recurringOldMissed = await factory.create('recurring-transaction', {
        interval: RecurringTransactionInterval.WEEKLY,
        missed: moment().subtract(15, 'days'),
      });
      const expectedOldMissed = await factory.create('expected-paycheck', {
        recurringTransactionId: recurringOldMissed.id,
        expectedDate: moment().subtract(3, 'days'),
      });
      const recurringRecentlyMissed = await factory.create('recurring-transaction', {
        interval: RecurringTransactionInterval.WEEKLY,
        missed: moment().subtract(10, 'days'),
      });
      const expectedRecentlyMissed = await factory.create('expected-paycheck', {
        recurringTransactionId: recurringRecentlyMissed.id,
        expectedDate: moment().subtract(3, 'days'),
      });

      const overdueIds = new Set();
      await streamOverdueExpectedIncome(trans => overdueIds.add(trans.id));
      expect(overdueIds).to.not.contain(expectedOldMissed.id);
      expect(overdueIds).to.contain(expectedRecentlyMissed.id);
    });

    it('should include biweekly recurring transactions missed within the last 30 days', async () => {
      const recurringOldMissed = await factory.create('recurring-transaction', {
        interval: RecurringTransactionInterval.BIWEEKLY,
        missed: moment().subtract(32, 'days'),
      });
      const expectedOldMissed = await factory.create('expected-paycheck', {
        recurringTransactionId: recurringOldMissed.id,
        expectedDate: moment().subtract(3, 'days'),
      });
      const recurringRecentlyMissed = await factory.create('recurring-transaction', {
        interval: RecurringTransactionInterval.BIWEEKLY,
        missed: moment().subtract(25, 'days'),
      });
      const expectedRecentlyMissed = await factory.create('expected-paycheck', {
        recurringTransactionId: recurringRecentlyMissed.id,
        expectedDate: moment().subtract(3, 'days'),
      });

      const overdueIds = new Set();
      await streamOverdueExpectedIncome(trans => overdueIds.add(trans.id));
      expect(overdueIds).to.not.contain(expectedOldMissed.id);
      expect(overdueIds).to.contain(expectedRecentlyMissed.id);
    });

    it('should include semi-monthly recurring transactions missed within the last 30 days', async () => {
      const recurringOldMissed = await factory.create('recurring-transaction', {
        interval: RecurringTransactionInterval.SEMI_MONTHLY,
        missed: moment().subtract(32, 'days'),
      });
      const expectedOldMissed = await factory.create('expected-paycheck', {
        recurringTransactionId: recurringOldMissed.id,
        expectedDate: moment().subtract(3, 'days'),
      });
      const recurringRecentlyMissed = await factory.create('recurring-transaction', {
        interval: RecurringTransactionInterval.SEMI_MONTHLY,
        missed: moment().subtract(25, 'days'),
      });
      const expectedRecentlyMissed = await factory.create('expected-paycheck', {
        recurringTransactionId: recurringRecentlyMissed.id,
        expectedDate: moment().subtract(3, 'days'),
      });

      const overdueIds = new Set();
      await streamOverdueExpectedIncome(trans => overdueIds.add(trans.id));
      expect(overdueIds).to.not.contain(expectedOldMissed.id);
      expect(overdueIds).to.contain(expectedRecentlyMissed.id);
    });

    it('should include monthly recurring transactions missed within the last 60 days', async () => {
      const recurringOldMissed = await factory.create('recurring-transaction', {
        interval: RecurringTransactionInterval.MONTHLY,
        missed: moment().subtract(61, 'days'),
      });
      const expectedOldMissed = await factory.create('expected-paycheck', {
        recurringTransactionId: recurringOldMissed.id,
        expectedDate: moment().subtract(3, 'days'),
      });
      const recurringRecentlyMissed = await factory.create('recurring-transaction', {
        interval: RecurringTransactionInterval.MONTHLY,
        missed: moment().subtract(45, 'days'),
      });
      const expectedRecentlyMissed = await factory.create('expected-paycheck', {
        recurringTransactionId: recurringRecentlyMissed.id,
        expectedDate: moment().subtract(3, 'days'),
      });

      const overdueIds = new Set();
      await streamOverdueExpectedIncome(trans => overdueIds.add(trans.id));
      expect(overdueIds).to.not.contain(expectedOldMissed.id);
      expect(overdueIds).to.contain(expectedRecentlyMissed.id);
    });

    it('should include weekday-monthly recurring transactions missed within the last 60 days', async () => {
      const recurringOldMissed = await factory.create('recurring-transaction', {
        interval: RecurringTransactionInterval.WEEKDAY_MONTHLY,
        missed: moment().subtract(61, 'days'),
      });
      const expectedOldMissed = await factory.create('expected-paycheck', {
        recurringTransactionId: recurringOldMissed.id,
        expectedDate: moment().subtract(3, 'days'),
      });
      const recurringRecentlyMissed = await factory.create('recurring-transaction', {
        interval: RecurringTransactionInterval.WEEKDAY_MONTHLY,
        missed: moment().subtract(45, 'days'),
      });
      const expectedRecentlyMissed = await factory.create('expected-paycheck', {
        recurringTransactionId: recurringRecentlyMissed.id,
        expectedDate: moment().subtract(3, 'days'),
      });

      const overdueIds = new Set();
      await streamOverdueExpectedIncome(trans => overdueIds.add(trans.id));
      expect(overdueIds).to.not.contain(expectedOldMissed.id);
      expect(overdueIds).to.contain(expectedRecentlyMissed.id);
    });

    it('should return count of missed incomes', async () => {
      const recurring = await factory.create('recurring-transaction', {
        interval: RecurringTransactionInterval.WEEKLY,
      });
      await factory.create('expected-paycheck', {
        recurringTransactionId: recurring.id,
        expectedDate: moment().subtract(3, 'days'),
      });
      await factory.create('expected-paycheck', {
        recurringTransactionId: recurring.id,
        expectedDate: moment().subtract(5, 'days'),
      });
      await factory.create('expected-paycheck', {
        recurringTransactionId: recurring.id,
        expectedDate: moment().subtract(6, 'days'),
      });

      const count = await streamOverdueExpectedIncome(() => {});
      expect(count).to.equal(3);
    });
  });

  describe('updateExpenses', () => {
    it('should mark missed expenses', async () => {
      const rec1 = await factory.create('recurring-transaction', {
        interval: RecurringTransactionInterval.WEEKLY,
      });
      const rec2 = await factory.create('recurring-transaction', {
        interval: RecurringTransactionInterval.WEEKLY,
      });
      await factory.createMany('expected-transaction', [
        {
          recurringTransactionId: rec1.id,
          expectedAmount: -300,
          expectedDate: moment().subtract(3, 'days'),
        },
        {
          recurringTransactionId: rec2.id,
          expectedAmount: -500,
          expectedDate: moment().subtract(3, 'days'),
        },
      ]);

      await updateExpenses();
      await rec1.reload();
      await rec2.reload();
      expect(rec1.missed.isSame(moment(), 'day')).to.be.true;
      expect(rec2.missed.isSame(moment(), 'day')).to.be.true;
    });

    it('should return count of missed expenses', async () => {
      const recurring = await factory.create('recurring-transaction', {
        interval: RecurringTransactionInterval.WEEKLY,
      });
      const baseParams = {
        recurringTransactionId: recurring.id,
        expectedAmount: -300,
      };
      await factory.createMany('expected-transaction', [
        { ...baseParams, expectedDate: moment().subtract(3, 'days') },
        { ...baseParams, expectedDate: moment().subtract(5, 'days') },
        { ...baseParams, expectedDate: moment().subtract(8, 'days') },
      ]);

      const count = await updateExpenses();
      expect(count).to.equal(3);
    });
  });

  describe('Notifications', () => {
    beforeEach(() => up());

    it('should send a notification if the missed transaction was the last main recurring one', async () => {
      const notifyTransactionMissed = sandbox.stub(Notifications, 'sendTransactionMissed');

      // we have 2 main recurring trx: 104, and 121. We them as being
      // missed.
      let recurring = await RecurringTransaction.findByPk(104);
      recurring.update({ missed: moment() });
      recurring = await RecurringTransaction.findByPk(121);
      recurring.update({ missed: moment() });
      const expected = await ExpectedTransaction.findByPk(142);
      expected.update({ expectedDate: expected.expectedDate.add(-4, 'days').format('YYYY-MM-DD') });

      // trx 106 is a missed transaction, so we set it as main and let
      // the system mark it as missed
      recurring = await RecurringTransaction.findByPk(106);
      const account = await BankAccount.findOne({ where: { id: recurring.bankAccountId } });
      await account.update({ mainPaycheckRecurringTransactionId: recurring.id });

      expect(recurring.missed).to.be.null;
      await recurring.update({ userAmount: 500 });
      expect(recurring.missed).to.be.null;

      await markRecurringTransactionsAsMissed();
      await recurring.reload();

      sinon.assert.calledOnce(notifyTransactionMissed);
      const recurArg = notifyTransactionMissed.firstCall.args[0];
      expect(recurArg.id).to.equal(recurring.id);
    });

    it("should NOT send a notification if the missed transaction was the last main recurring one but hasn't reach the date threshold", async () => {
      const notifyTransactionMissed = sandbox.stub(Notifications, 'sendTransactionMissed');

      // we have 2 main recurring trx: 104, and 121. We them as being
      // missed.
      let recurring = await RecurringTransaction.findByPk(104);
      recurring.update({ missed: moment() });
      recurring = await RecurringTransaction.findByPk(121);
      recurring.update({ missed: moment() });

      // trx 106 is a missed transaction, so we set it as main and let
      // the system mark it as missed
      recurring = await RecurringTransaction.findByPk(106);
      const account = await BankAccount.findOne({ where: { id: recurring.bankAccountId } });
      await account.update({ mainPaycheckRecurringTransactionId: recurring.id });

      expect(recurring.missed).to.be.null;
      await recurring.update({ userAmount: 500 });
      expect(recurring.missed).to.be.null;

      await markRecurringTransactionsAsMissed();
      await recurring.reload();

      sinon.assert.notCalled(notifyTransactionMissed);
    });

    it('should NOT send a notification if the missed transaction was not the last recurring one', async () => {
      const notifyTransactionMissed = sandbox.stub(Notifications, 'sendTransactionMissed');

      const recurring = await RecurringTransaction.findByPk(106);
      const account = await BankAccount.findOne({ where: { id: recurring.bankAccountId } });
      await account.update({ mainPaycheckRecurringTransactionId: recurring.id });
      const expected = await ExpectedTransaction.findByPk(142);
      expected.update({ expectedDate: expected.expectedDate.add(-4, 'days').format('YYYY-MM-DD') });

      expect(recurring.missed).to.be.null;
      await recurring.update({ userAmount: 500 });
      expect(recurring.missed).to.be.null;
      await markRecurringTransactionsAsMissed();
      await recurring.reload();

      sinon.assert.notCalled(notifyTransactionMissed);
    });

    it('should not crash if the bank account is deleted', async () => {
      const recurring = await RecurringTransaction.findByPk(106);
      const account = await BankAccount.findOne({ where: { id: recurring.bankAccountId } });
      await account.destroy();

      expect(recurring.missed).to.be.null;
      await recurring.update({ userAmount: 500 });
      await markRecurringTransactionsAsMissed();
      await recurring.reload();

      expect(recurring.missed).not.to.be.null;
    });

    it('should not send a notification if the missed transaction is an expense', async () => {
      const brazeTrackSpy = sandbox.stub(braze, 'track');
      const notifyStatusChangeSpy = sandbox.stub(Notifications, 'notifyIncomeStatusChange');

      await RecurringTransaction.update({ userAmount: -500 }, { where: {} });
      const recurring = await RecurringTransaction.findByPk(106);
      expect(recurring.missed).to.be.null;
      await markRecurringTransactionsAsMissed();

      sinon.assert.notCalled(brazeTrackSpy);
      sinon.assert.notCalled(notifyStatusChangeSpy);
    });

    it("should not send a notification if the missed transaction is not the user's main paycheck", async () => {
      const notifyTransactionMissed = sandbox.stub(Notifications, 'sendTransactionMissed');

      const recurring = await RecurringTransaction.findByPk(106);
      const account = await BankAccount.findOne({ where: { id: recurring.bankAccountId } });
      await account.update({ mainPaycheckRecurringTransactionId: null });

      await recurring.update({ userAmount: 500 });

      await markRecurringTransactionsAsMissed();

      await recurring.reload();

      expect(recurring.missed).to.not.be.null;
      sinon.assert.notCalled(notifyTransactionMissed);
    });

    it('should send notification for income status updates', async () => {
      const notifyStatusChangeSpy = sandbox.stub(Notifications, 'notifyIncomeStatusChange');

      const recurring = await createTestRecurringTransaction({ id: 200, userAmount: 100 });
      await factory.create('expected-paycheck', {
        recurringTransactionId: recurring.id,
        expectedDate: moment().subtract(5, 'days'),
      });
      await markRecurringTransactionsAsMissed();

      const [statusCall] = notifyStatusChangeSpy.getCalls().filter(call => {
        return call.args[0].id === recurring.id;
      });

      expect(statusCall).to.not.be.undefined;
      expect(statusCall.args[1]).to.equal(RecurringTransactionStatus.MISSED);
      expect(statusCall.args[2]).to.equal(RecurringTransactionStatus.VALID);
    });

    it('should not send notification for expense status updates', async () => {
      const notifyStatusChangeSpy = sandbox.stub(Notifications, 'notifyIncomeStatusChange');

      const recurring = await createTestRecurringTransaction({
        id: 200,
        userAmount: -100,
        type: TransactionType.EXPENSE,
      });
      await factory.create('expected-transaction', {
        recurringTransactionId: recurring.id,
        expectedDate: moment().subtract(5, 'days'),
      });
      await markRecurringTransactionsAsMissed();

      const [statusCall] = notifyStatusChangeSpy.getCalls().filter(call => {
        return call.args[0].id === recurring.id;
      });

      expect(statusCall).to.be.undefined;
    });
  });
});
