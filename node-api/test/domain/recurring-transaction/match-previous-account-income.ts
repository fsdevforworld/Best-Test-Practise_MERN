import { expect } from 'chai';
import * as sinon from 'sinon';
import { clean, up } from '../../test-helpers';
import factory from '../../factories';
import { DateOnly, moment } from '@dave-inc/time-lib';
import {
  ExpectedTransactionStatus,
  RecurringTransaction,
} from '../../../src/domain/recurring-transaction/types';
import { RecurringTransactionStatus, TransactionType } from '../../../src/typings';
import {
  AuditLog,
  BankAccount,
  BankConnection,
  ExpectedTransaction,
  RecurringTransaction as DBRecurringTransaction,
} from '../../../src/models';
import {
  matchPreviousAccountIncome,
  doIncomeTransition,
  MatchPreviousAccountIncomeResult,
} from '../../../src/domain/recurring-transaction/match-previous-account-income';
import { RecurringTransactionInterval } from '@dave-inc/wire-typings';
import * as Store from '../../../src/domain/recurring-transaction/store';
import { ACTIVE_TIMESTAMP } from '../../../src/lib/sequelize';
import stubBankTransactionClient from '../../test-helpers/stub-bank-transaction-client';
import { formatRecurringTransaction } from '../../../src/domain/recurring-transaction/store';

describe('RecurringTransactionDomain/match-previous-account-income', () => {
  const sandbox = sinon.createSandbox();

  // clean everything before we start
  before(() => clean());

  // insert user and user_session data
  beforeEach(async () => {
    stubBankTransactionClient(sandbox);
    await up();
  });
  //truncate user and user_session data
  afterEach(() => clean(sandbox));

  async function setupBankConnections(userId: number): Promise<[BankConnection, BankConnection]> {
    return await Promise.all([
      factory.create('bank-connection', { userId }),
      factory.create('bank-connection', { userId }),
    ]);
  }

  async function setupBankAccounts(
    oldBankConnection: BankConnection,
    newBankConnection: BankConnection,
    userId: number,
  ): Promise<[BankAccount, BankAccount]> {
    const [oldAccount, newAccount] = await Promise.all([
      factory.create<BankAccount>('bank-account', {
        userId,
        bankConnectionId: oldBankConnection.id,
      }),
      factory.create<BankAccount>('bank-account', {
        userId,
        bankConnectionId: newBankConnection.id,
      }),
    ]);

    await factory.create('bank-connection-transition', {
      fromBankConnectionId: oldBankConnection.id,
      toBankConnectionId: newBankConnection.id,
      fromDefaultBankAccountId: oldAccount.id,
      hasReceivedFirstPaycheck: true,
      hasReceivedRecurringPaycheck: false,
    });

    return [oldAccount, newAccount];
  }

  async function setupRecurringTransaction(
    bankAccount: BankAccount,
  ): Promise<DBRecurringTransaction> {
    return await factory.create<DBRecurringTransaction>('recurring-transaction', {
      userId: bankAccount.userId,
      bankAccountId: bankAccount.id,
      userAmount: 250,
      interval: RecurringTransactionInterval.WEEKLY,
      params: [DateOnly.fromMoment(moment()).getWeekdayName()],
      status: RecurringTransactionStatus.VALID,
    });
  }

  async function setupExpectedTransaction(
    recurringTransaction: RecurringTransaction,
    params: Partial<ExpectedTransaction> = {},
  ): Promise<ExpectedTransaction> {
    const { status = ExpectedTransactionStatus.PREDICTED, expectedDate = moment() } = params;

    return await factory.create<ExpectedTransaction>('expected-transaction', {
      ...params,
      recurringTransactionId: recurringTransaction.id,
      expectedDate,
      status,
      type: TransactionType.INCOME,
      expectedAmount: 250,
    });
  }

  describe('matchPreviousAccountIncome', () => {
    it('matches transactions against income from previous account', async () => {
      const user = await factory.create('user');

      const [oldBankConnection, newBankConnection] = await setupBankConnections(user.id);
      const [oldBankAccount, newBankAccount] = await setupBankAccounts(
        oldBankConnection,
        newBankConnection,
        user.id,
      );
      const recurring = await setupRecurringTransaction(oldBankAccount);
      const expectedTransaction = await setupExpectedTransaction(recurring);

      const bankTransaction = await factory.create('bank-transaction', {
        bankAccountId: newBankAccount.id,
        userId: user.id,
        displayName: recurring.transactionDisplayName,
        transactionDate: moment().subtract(1, 'day'),
        amount: 250,
      });

      const results = await matchPreviousAccountIncome(newBankAccount);

      expect(results.length).to.eq(1);

      const [result] = results;

      expect(result.oldIncome.id).to.eq(recurring.id);
      expect(result.toBankAccount.id).to.eq(newBankAccount.id);

      expect(result.matchedTransactions.length).to.eq(1);
      const [match] = result.matchedTransactions;
      expect(match[0].id).to.eq(expectedTransaction.id);
      expect(match[1].id).to.eq(bankTransaction.id);
    });

    it('matches using closest bank transaction', async () => {
      const user = await factory.create('user');

      const [oldBankConnection, newBankConnection] = await setupBankConnections(user.id);
      const [oldBankAccount, newBankAccount] = await setupBankAccounts(
        oldBankConnection,
        newBankConnection,
        user.id,
      );
      const recurring = await setupRecurringTransaction(oldBankAccount);
      const expectedTransaction = await setupExpectedTransaction(recurring);

      const [newerBankTransaction] = await Promise.all([
        factory.create('bank-transaction', {
          bankAccountId: newBankAccount.id,
          userId: user.id,
          displayName: recurring.transactionDisplayName,
          transactionDate: moment().subtract(1, 'day'),
          amount: 250,
        }),
        factory.create('bank-transaction', {
          bankAccountId: newBankAccount.id,
          userId: user.id,
          displayName: recurring.transactionDisplayName,
          transactionDate: moment().subtract(1, 'week'),
          amount: 250,
        }),
      ]);

      const [result] = await matchPreviousAccountIncome(newBankAccount);
      expect(result.matchedTransactions.length).to.eq(1);
      const [match] = result.matchedTransactions;
      expect(match[0].id).to.eq(expectedTransaction.id);
      expect(match[1].id).to.eq(newerBankTransaction.id);
    });

    it('ignores transactions with wrong sign on amount', async () => {
      const user = await factory.create('user');

      const [oldBankConnection, newBankConnection] = await setupBankConnections(user.id);
      const [oldBankAccount, newBankAccount] = await setupBankAccounts(
        oldBankConnection,
        newBankConnection,
        user.id,
      );
      const recurring = await setupRecurringTransaction(oldBankAccount);

      await setupExpectedTransaction(recurring);

      await factory.create('bank-transaction', {
        bankAccountId: newBankAccount.id,
        userId: user.id,
        displayName: recurring.transactionDisplayName,
        transactionDate: moment().subtract(1, 'day'),
        amount: -250,
      });

      const results = await matchPreviousAccountIncome(newBankAccount);

      expect(results).to.be.empty;
    });

    it('only matches predicted transactions', async () => {
      const user = await factory.create('user');

      const [oldBankConnection, newBankConnection] = await setupBankConnections(user.id);
      const [oldBankAccount, newBankAccount] = await setupBankAccounts(
        oldBankConnection,
        newBankConnection,
        user.id,
      );
      const recurring = await setupRecurringTransaction(oldBankAccount);

      await setupExpectedTransaction(recurring, {
        status: ExpectedTransactionStatus.PENDING,
        expectedDate: moment().subtract(1, 'day'),
      });
      await setupExpectedTransaction(recurring, { status: ExpectedTransactionStatus.SETTLED });

      await factory.create('bank-transaction', {
        bankAccountId: newBankAccount.id,
        userId: user.id,
        displayName: recurring.transactionDisplayName,
        transactionDate: moment().subtract(1, 'day'),
        amount: 250,
      });

      const results = await matchPreviousAccountIncome(newBankAccount);

      expect(results).to.be.empty;
    });

    it('only matches against bank transactions inside time window', async () => {
      const user = await factory.create('user');

      const [oldBankConnection, newBankConnection] = await setupBankConnections(user.id);
      const [oldBankAccount, newBankAccount] = await setupBankAccounts(
        oldBankConnection,
        newBankConnection,
        user.id,
      );
      const recurring = await setupRecurringTransaction(oldBankAccount);

      await setupExpectedTransaction(recurring);

      await factory.create('bank-transaction', {
        bankAccountId: newBankAccount.id,
        userId: user.id,
        displayName: recurring.transactionDisplayName,
        transactionDate: moment().subtract(60, 'day'),
        amount: 250,
      });

      const results = await matchPreviousAccountIncome(newBankAccount);

      expect(results).to.be.empty;
    });
  });

  describe('doIncomeTransition', () => {
    it('moves income to new account', async () => {
      const user = await factory.create('user');

      const [oldBankConnection, newBankConnection] = await setupBankConnections(user.id);
      const [oldBankAccount, newBankAccount] = await setupBankAccounts(
        oldBankConnection,
        newBankConnection,
        user.id,
      );
      const recurring = await setupRecurringTransaction(oldBankAccount);
      const expectedTransaction = await setupExpectedTransaction(recurring);

      const bankTransaction = await factory.create('bank-transaction', {
        bankAccountId: newBankAccount.id,
        userId: user.id,
        displayName: recurring.transactionDisplayName,
        transactionDate: moment().subtract(1, 'day'),
        amount: 250,
      });

      const matchResult: MatchPreviousAccountIncomeResult = {
        oldIncome: formatRecurringTransaction(recurring),
        matchedTransactions: [[expectedTransaction, bankTransaction]],
        toBankAccount: newBankAccount,
      };

      await doIncomeTransition(matchResult);

      const recurringForNewAccount = await Store.getByBankAccount(newBankAccount.id);
      expect(recurringForNewAccount.length).to.eq(1);

      const newRecurring = recurringForNewAccount[0];

      expect(newRecurring.transactionDisplayName).to.eq(recurring.transactionDisplayName);
      expect(newRecurring.status).to.eq(RecurringTransactionStatus.VALID);
      expect(newRecurring.bankAccountId).to.eq(newBankAccount.id);

      await Promise.all([expectedTransaction.reload(), recurring.reload({ paranoid: false })]);

      expect(expectedTransaction.recurringTransactionId).to.eq(newRecurring.id);
      expect(expectedTransaction.bankTransactionId).to.eq(bankTransaction.id);

      expect(recurring.deleted.toDate()).to.be.lessThan(moment(ACTIVE_TIMESTAMP).toDate());

      const auditLog = await AuditLog.findOne({
        where: {
          type: AuditLog.TYPES.DETECT_INCOME_ACCOUNT_TRANSITION,
          eventUuid: newRecurring.id,
        },
      });

      expect(auditLog).to.exist;
      expect(auditLog.extra).to.eql({
        fromBankAccountId: recurring.bankAccountId,
        toBankAccountId: newRecurring.bankAccountId,
        oldRecurringTransactionId: recurring.id,
        newRecurringTransactionId: newRecurring.id,
      });
    });
  });
});
