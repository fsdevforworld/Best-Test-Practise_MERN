import { Moment } from 'moment';
import { ExpectedTransaction as DBExpectedTransaction } from '../../models';
import { moment } from '@dave-inc/time-lib';
import * as Store from './store';
import { ExpectedTransaction, ExpectedTransactionStatus, RecurringTransaction } from './types';

async function insertExpectedInTimeRange(
  recurringTransactions: RecurringTransaction[],
  startDate: Moment,
  endDate: Moment,
): Promise<void> {
  const allExpected = recurringTransactions.reduce((result: any[], current) => {
    return result.concat(getExpectedInRange(current, startDate, endDate));
  }, []);

  // Use bulk create with ignore duplicate to handle database lock errors
  // Also make sure that the ExpectedTransaction is coverted to Object
  // otherwise bulkCreate inserts rows with NULL values
  await Store.insertExpected(allExpected);
}

export async function getByAccountId(
  accountId: number,
  start: Moment | string,
  end: Moment | string,
): Promise<ExpectedTransaction[]> {
  const startDate = moment(start);
  const endDate = moment(end);
  const allRecurring = await Store.getByBankAccount(accountId);

  await insertExpectedInTimeRange(allRecurring, startDate, endDate);

  return Store.getExpectedByRecurring(
    allRecurring.map(a => a.id),
    startDate,
    endDate,
  );
}

export async function getByRecurringTransaction(
  recurringTransaction: RecurringTransaction,
  start: Moment | string,
  end: Moment | string = moment(),
  where?: { status?: ExpectedTransactionStatus },
): Promise<ExpectedTransaction[]> {
  const startDate = moment(start);
  const endDate = moment(end);

  const mostRecentExpected = await Store.getMostRecentExpected(recurringTransaction.id);

  // only generate ungenerated expected transactions from the last expected date forward
  const lastExpectedDate = recurringTransaction.rsched.before(moment(), true);
  const createStart: Moment = mostRecentExpected
    ? mostRecentExpected.expectedDate
    : lastExpectedDate;
  if (createStart.isSameOrBefore(endDate)) {
    await insertExpectedInTimeRange([recurringTransaction], createStart, endDate);
  }

  // Existing contain settled/pending information.
  return Store.getExpectedByRecurring([recurringTransaction.id], startDate, endDate, where?.status);
}

export async function getNextExpectedTransactionById(
  recurringTransactionId: number,
  bankAccountId: number,
  today: Moment = moment(),
): Promise<ExpectedTransaction | null> {
  const recurring = await Store.getById(recurringTransactionId, bankAccountId);
  if (!recurring) {
    return null;
  }
  return getNextExpectedTransaction(recurring, today);
}

export async function getNextExpectedTransaction(
  recurringTransaction: RecurringTransaction,
  after: Moment = moment(),
): Promise<ExpectedTransaction> {
  const rsched = recurringTransaction.rsched;
  const next = rsched.after(after);

  const expected = await Store.getExpectedByDate(recurringTransaction.id, next);

  if (!expected) {
    const [newExpected] = createFromDates(recurringTransaction, [next]);
    return Store.upsertExpected(newExpected);
  }

  return expected;
}

export function getExpectedInRange(
  recurringTransaction: RecurringTransaction,
  startDate: Moment,
  endDate: Moment,
): ExpectedTransaction[] {
  const rsched = recurringTransaction.rsched;
  const dates = rsched.between(startDate, endDate, true);
  return createFromDates(recurringTransaction, dates);
}

export function createFromDates(
  recurringTransaction: RecurringTransaction,
  dates: Array<Date | Moment>,
): ExpectedTransaction[] {
  const build = (date: Date | Moment) => {
    return DBExpectedTransaction.build({
      pendingDisplayName: recurringTransaction.pendingDisplayName,
      recurringTransactionId: recurringTransaction.id,
      bankAccountId: recurringTransaction.bankAccountId,
      userId: recurringTransaction.userId,
      displayName:
        recurringTransaction.userDisplayName ?? recurringTransaction.transactionDisplayName,
      expectedDate: moment(date),
      expectedAmount: recurringTransaction.userAmount,
      type: recurringTransaction.userAmount > 0 ? 'INCOME' : 'EXPENSE',
    });
  };

  return dates.map(build).map(Store.formatExpectedTransaction);
}

export function getNextExpectedPaycheckForAccount(
  bankAccountId: number,
  mainPaycheckId?: number,
  today?: Moment,
): PromiseLike<ExpectedTransaction | null> {
  if (mainPaycheckId) {
    return getNextExpectedTransactionById(mainPaycheckId, bankAccountId, today);
  } else {
    return null;
  }
}
