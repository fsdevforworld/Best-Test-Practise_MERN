import * as Bluebird from 'bluebird';
import { isNil } from 'lodash';
import { Moment } from 'moment';
import { Op, WhereOptions } from 'sequelize';
import {
  ExpectedTransaction as DBExpectedTransaction,
  RecurringTransaction as DBRecurringTransaction,
} from '../../models';
import { RecurringTransactionStatus, TransactionType } from '../../typings';
import { NotFoundError } from '../../lib/error';
import logger from '../../lib/logger';
import { moment } from '@dave-inc/time-lib';
import { RSched } from '../../lib/recurring-schedule';
import { bulkInsertAndRetry } from '../../lib/sequelize-helpers';
import {
  CreateParams,
  ExpectedTransaction,
  ExpectedTransactionStatus,
  RecurringTransaction,
  UpdateParams,
} from './types';

// Extract just the data from Sequelize objects
export function formatRecurringTransaction(
  recurringTransaction: DBRecurringTransaction,
): RecurringTransaction | undefined {
  if (recurringTransaction) {
    return {
      id: recurringTransaction.id,
      bankAccountId: recurringTransaction.bankAccountId,
      userId: recurringTransaction.userId,

      transactionDisplayName: recurringTransaction.transactionDisplayName,

      userAmount: recurringTransaction.userAmount,
      type: recurringTransaction.type,

      userDisplayName: recurringTransaction.userDisplayName,
      pendingDisplayName: recurringTransaction.pendingDisplayName,
      possibleNameChange: recurringTransaction.possibleNameChange,

      rsched: new RSched(
        recurringTransaction.interval,
        recurringTransaction.params,
        recurringTransaction.rollDirection,
        recurringTransaction.dtstart,
      ),

      status: recurringTransaction.status,

      terminated: recurringTransaction.terminated,
      missed: recurringTransaction.missed,
      created: recurringTransaction.created,
      updated: recurringTransaction.updated,
      deleted: recurringTransaction.deleted,
      isGroundhog: false,
    };
  }
}

function formatRecurringTransactions(
  recurringTransactions: DBRecurringTransaction[],
): RecurringTransaction[] {
  return recurringTransactions.map(formatRecurringTransaction);
}

export async function getById(
  recurringTransactionId: number,
  bankAccountId?: number,
): Promise<RecurringTransaction | undefined> {
  const query = bankAccountId
    ? { id: recurringTransactionId, bankAccountId }
    : { id: recurringTransactionId };
  const result = await DBRecurringTransaction.findOne({
    where: query,
  });
  return formatRecurringTransaction(result);
}

export async function getByIds(
  ids: number[],
  bankAccountId?: number,
): Promise<RecurringTransaction[]> {
  const query = bankAccountId ? { id: ids, bankAccountId } : { id: ids };
  const results = await DBRecurringTransaction.findAll({
    where: query,
  });
  return formatRecurringTransactions(results);
}

export async function getByUser(userId: number): Promise<RecurringTransaction[]> {
  const results = await DBRecurringTransaction.findAll({ where: { userId } });
  return formatRecurringTransactions(results);
}

export async function getByUserAndType(
  userId: number,
  type: TransactionType = null,
  includeMissed: boolean = false,
): Promise<RecurringTransaction[]> {
  const where: WhereOptions = { userId };
  if (!isNil(type)) {
    where.type = type;
  }
  if (!includeMissed) {
    where.missed = null as Moment;
    where.status = { [Op.ne]: RecurringTransactionStatus.MISSED };
  }
  const results = await DBRecurringTransaction.findAll({ where });
  return formatRecurringTransactions(results);
}

export async function getUserIncomesByStatus(
  userId: number,
  bankAccountId: number,
  status: RecurringTransactionStatus[],
): Promise<RecurringTransaction[]> {
  const results = await DBRecurringTransaction.findAll({
    where: {
      userId,
      bankAccountId,
      // use amount here, as type can sometimes be unreliable
      userAmount: {
        [Op.gt]: 0,
      },
      status,
    },
  });
  return formatRecurringTransactions(results);
}

export async function getByBankAccount(
  bankAccountId: number,
  options: {
    includeDeleted?: boolean;
    type?: TransactionType;
    status?: RecurringTransactionStatus;
    useReadReplica?: boolean;
  } = {},
): Promise<RecurringTransaction[]> {
  const { includeDeleted = false, type, status, useReadReplica = false } = options;
  const where: WhereOptions = { bankAccountId };

  if (!isNil(type)) {
    where.type = type;
  }

  if (!isNil(status)) {
    where.status = status;
  }

  const results = await DBRecurringTransaction.findAll({
    where,
    paranoid: !includeDeleted,
    useMaster: !useReadReplica,
  });
  return formatRecurringTransactions(results);
}

export async function getMatchableByBankAccount(
  bankAccountId: number,
): Promise<RecurringTransaction[]> {
  const results = await DBRecurringTransaction.scope('matchable').findAll({
    where: { bankAccountId },
  });
  return formatRecurringTransactions(results);
}

export async function getDuplicate(
  recurringTransaction: RecurringTransaction,
): Promise<RecurringTransaction> {
  const result = await DBRecurringTransaction.findOne({
    where: {
      bankAccountId: recurringTransaction.bankAccountId,
      userId: recurringTransaction.userId,
      transactionDisplayName: recurringTransaction.transactionDisplayName,
    },
  });
  return formatRecurringTransaction(result);
}

// Not exactly a DB operation, but use ORM object to prefill default
// values such as deleted timestamp
export function build(params: CreateParams): RecurringTransaction {
  return formatRecurringTransaction(DBRecurringTransaction.build(params));
}

export async function insert(
  recurringTransactions: RecurringTransaction[],
): Promise<RecurringTransaction[]> {
  const insertParams: CreateParams[] = recurringTransactions.map(rt => {
    return {
      ...rt,
      interval: rt.rsched.interval,
      params: rt.rsched.params,
      rollDirection: rt.rsched.rollDirection,
      dtstart: rt.rsched.weeklyStart.toMoment(),
    };
  });
  const results = await bulkInsertAndRetry(DBRecurringTransaction, insertParams, 100, 3);
  const inserted = results.filter(row => !isNil(row.id));
  return formatRecurringTransactions(inserted);
}

export async function update(
  recurringTransactionId: number,
  params: UpdateParams,
): Promise<RecurringTransaction> {
  const row = await DBRecurringTransaction.findByPk(recurringTransactionId);
  const updated = await row.update(params);
  return formatRecurringTransaction(updated);
}

export async function deleteById(recurringTransactionId: number): Promise<void> {
  await DBRecurringTransaction.destroy({
    where: { id: recurringTransactionId },
  });
}

/**
 * This should be run if the schedule has changed or the parent recurring transactions is deleted. This function
 * deletes any future transactions and also detaches old expected transactions so we can still store analytics on
 * them, but so they won't interfere with any future recurring transactions.
 */
export async function detachExpectedTransactions(
  recurringTransaction: RecurringTransaction,
): Promise<void> {
  await DBExpectedTransaction.destroy({
    where: {
      expectedDate: { [Op.gte]: recurringTransaction.missed || moment() },
      settledDate: null,
      pendingDate: null,
      recurringTransactionId: recurringTransaction.id,
    },
    force: true,
  });
  const transactions = await DBExpectedTransaction.findAll({
    where: {
      recurringTransactionId: recurringTransaction.id,
    },
  });
  await Bluebird.map(transactions, async transaction => {
    // We have to use this instead of transaction.update() because transaction.update will not set deleted.
    return DBExpectedTransaction.update(
      {
        extra: {
          scheduleChange: true,
        },
        // We set settled to be pending in case we detach this before the settled update. This is strictly for
        // analytics purposes.
        settledDate: transaction.settledDate || transaction.pendingDate,
        settledAmount: transaction.settledAmount || transaction.pendingAmount,
        deleted: moment(),
      },
      { where: { id: transaction.id } },
    );
  });
}

// Extract just the data from Sequelize objects
export function formatExpectedTransaction(
  expectedTransaction: DBExpectedTransaction | ExpectedTransaction,
): ExpectedTransaction {
  if (expectedTransaction) {
    return {
      id: expectedTransaction.id,
      bankAccountId: expectedTransaction.bankAccountId,
      userId: expectedTransaction.userId,
      recurringTransactionId: expectedTransaction.recurringTransactionId,
      bankTransactionId: expectedTransaction.bankTransactionId,
      type: expectedTransaction.type,
      displayName: expectedTransaction.displayName,
      pendingDisplayName: expectedTransaction.pendingDisplayName,
      expectedAmount: expectedTransaction.expectedAmount,
      pendingAmount: expectedTransaction.pendingAmount,
      settledAmount: expectedTransaction.settledAmount,
      expectedDate: expectedTransaction.expectedDate,
      pendingDate: expectedTransaction.pendingDate,
      settledDate: expectedTransaction.settledDate,
      extra: expectedTransaction.extra,
      created: expectedTransaction.created,
      updated: expectedTransaction.updated,
      deleted: expectedTransaction.deleted,
      status: expectedTransaction.status,
      isGroundhog: false,
    };
  }
}

function formatExpectedTransactions(
  expectedTransactions: DBExpectedTransaction[],
): ExpectedTransaction[] {
  return expectedTransactions.map(formatExpectedTransaction);
}

export async function insertExpected(
  expectedTransactions: ExpectedTransaction[],
): Promise<ExpectedTransaction[]> {
  const results = await bulkInsertAndRetry(DBExpectedTransaction, expectedTransactions, 100, 3);
  return formatExpectedTransactions(results);
}

export async function upsertExpected(
  expectedTransaction: ExpectedTransaction,
): Promise<ExpectedTransaction> {
  const row = await DBExpectedTransaction.findOne({
    where: {
      bankAccountId: expectedTransaction.bankAccountId,
      recurringTransactionId: expectedTransaction.recurringTransactionId,
      expectedDate: expectedTransaction.expectedDate.format('YYYY-MM-DD'),
    },
    paranoid: false,
  });

  if (isNil(row)) {
    const [inserted] = await insertExpected([expectedTransaction]);
    return inserted;
  } else {
    if (row.deleted !== null) {
      await row.restore();
    }
    const updated = await row.update({ ...expectedTransaction });
    return formatExpectedTransaction(updated);
  }
}

export async function getExpectedById(expectedTransactionId: number): Promise<ExpectedTransaction> {
  const result = await DBExpectedTransaction.findByPk(expectedTransactionId);
  return formatExpectedTransaction(result);
}

export async function getExpectedByRecurring(
  recurringTransactionIds: number[],
  startDate: Moment,
  endDate: Moment = moment(),
  status?: ExpectedTransactionStatus,
): Promise<ExpectedTransaction[]> {
  const where: WhereOptions = {
    recurringTransactionId: recurringTransactionIds,
    expectedDate: {
      [Op.gte]: startDate.toDate(),
      [Op.lte]: endDate.toDate(),
    },
  };

  if (!isNil(status)) {
    where.status = status;
  }

  const results = await DBExpectedTransaction.findAll({
    where,
    order: [['expectedDate', 'ASC']],
  });
  return formatExpectedTransactions(results);
}

export async function getExpectedByUser(
  userId: number,
  startDate: Moment,
  endDate: Moment = moment(),
): Promise<ExpectedTransaction[]> {
  const results = await DBExpectedTransaction.findAll({
    where: {
      userId,
      expectedDate: {
        [Op.gte]: startDate,
        [Op.lte]: endDate,
      },
    },
    order: [['expectedDate', 'ASC']],
  });
  return formatExpectedTransactions(results);
}

export async function getExpectedExpensesByUser(
  userId: number,
  { limit = 100 }: { limit: number } = { limit: 100 },
): Promise<ExpectedTransaction[]> {
  const results = await DBExpectedTransaction.findAll({
    where: {
      userId,
      expectedAmount: { [Op.lt]: 0 },
    },
    limit,
  });
  return formatExpectedTransactions(results);
}

export async function getExpectedByDate(
  recurringTransactionId: number,
  expectedDate: Moment,
): Promise<ExpectedTransaction> {
  const result = await DBExpectedTransaction.findOne({
    where: {
      recurringTransactionId,
      expectedDate: expectedDate.format('YYYY-MM-DD'),
    },
  });
  return formatExpectedTransaction(result);
}

export async function getMostRecentExpected(
  recurringTransactionId: number,
): Promise<ExpectedTransaction> {
  const result = await DBExpectedTransaction.findOne({
    where: {
      recurringTransactionId,
    },
    order: [['expectedDate', 'DESC']],
  });
  return formatExpectedTransaction(result);
}

export async function updateExpectedTransaction(
  expectedTransactionId: number,
  params: Partial<ExpectedTransaction>,
): Promise<ExpectedTransaction> {
  const [n] = await DBExpectedTransaction.update(params, {
    where: { id: expectedTransactionId },
  });
  if (n === 0) {
    logger.error('expected transaction not updated', {
      expectedTransactionId,
      params,
    });
    throw new NotFoundError('Expected transaction update failed');
  }
  const updated = await getExpectedById(expectedTransactionId);
  return formatExpectedTransaction(updated);
}

export async function deleteExpectedByRecurring(recurringTransactionId: number): Promise<number> {
  return DBExpectedTransaction.destroy({ where: { recurringTransactionId }, limit: 10000 });
}
