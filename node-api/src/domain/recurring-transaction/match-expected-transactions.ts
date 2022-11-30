import { AuditLog } from '../../models';
import * as Bluebird from 'bluebird';
import { nextBankingDay } from '../../lib/banking-days';
import { RecurringTransactionStatus, RollDirection, TransactionType } from '../../typings';
import { DateRange, max, Moment, moment } from '@dave-inc/time-lib';
import * as _ from 'lodash';
import { getBestScheduleMatch } from './detect-recurring-schedule';
import { RSched } from '../../lib/recurring-schedule';
import { getByRecurringTransaction, getNextExpectedTransaction } from './generators';
import {
  IntervalDuration,
  MINIMUM_INCOME_AMOUNT,
  RSCHED_CONFIDENCE_THRESHOLD,
  TRANSACTION_SETTLEMENT_DAYS,
} from './constants';
import Notifications from './notifications';
import logger from '../../lib/logger';
import { metrics, RecurringTransactionMetrics as Metrics } from './metrics';
import * as Store from './store';
import {
  ExpectedTransaction,
  ExpectedTransactionStatus,
  RecurringTransaction,
  UpdateParams,
} from './types';
import * as Utils from './utils';
import HeathClient from '../../lib/heath-client';
import { BankTransaction, BankTransactionStatus, SortOrder } from '@dave-inc/heath-client';
import * as uuid from '@dave-inc/uuid-helper';

/**
 * For all recurring transactions looks through unmatched expected transactions and tries to match them. Also
 * looks at all expected that are pending and tries to update them.
 */
export async function updateByAccountId(
  bankAccountId: number,
  source?: string,
  useReaReplica: boolean = false,
  startDate: Moment = transactionLookBackStartDate(moment()),
  endDate: Moment = transactionLookForwardEndDate(moment()),
): Promise<void> {
  logger.debug('updating expected recurring transactions', { bankAccountId, source, startDate });

  // get all that are based off a transaction
  const recurringTransactions = await Store.getMatchableByBankAccount(bankAccountId);

  const goodRecurring = _.compact(recurringTransactions);

  if (goodRecurring.length === 0) {
    logger.debug('no recurring transactions found', { bankAccountId });
    metrics.increment(Metrics.EXPECTED_TRANSACTION_MATCH_NO_RECURRING_FOUND);
  }

  await Bluebird.mapSeries(goodRecurring, async (recurring: RecurringTransaction) => {
    // lets not generate any before this recurring transaction was created
    const updateStartDate = max(recurring.created, startDate);
    return updateByRecurringTransaction(recurring, updateStartDate, endDate, useReaReplica, source);
  });
}

async function updateByRecurringTransaction(
  recurring: RecurringTransaction,
  startDate: Moment = transactionLookBackStartDate(moment()),
  endDate: Moment = transactionLookForwardEndDate(moment()),
  useReadReplica: boolean = false,
  source?: string,
): Promise<void> {
  logger.debug('update recurring transaction', {
    bankAccountId: recurring.bankAccountId,
    recurringTransaction: recurring.id,
  });

  const allExpected = await getByRecurringTransaction(recurring, startDate, endDate);
  const updatedExpected = await _updatePendingExpectedTransactions(
    allExpected,
    recurring,
    useReadReplica,
  );

  // Only test the unmatched expected transactions
  const predicted = updatedExpected.filter(
    expect => expect.status === ExpectedTransactionStatus.PREDICTED,
  );

  logger.debug('unmatched expected transactions', {
    bankAccountId: recurring.bankAccountId,
    recurringTransaction: recurring.id,
    predictedTransactions: predicted.map(p => p.id),
    count: predicted.length,
  });

  if (predicted.length === 0) {
    return;
  }

  const dateRangeFirst = expectedRecurringTransactionWindow(
    predicted[0].expectedDate,
    recurring.rsched,
  );
  const dateRangeLast = expectedRecurringTransactionWindow(
    _.last(predicted).expectedDate,
    recurring.rsched,
  );
  const alreadyMatchedTransactionIds = matchedTransactionIds(updatedExpected);
  const query = {
    transactionDate: {
      gte: dateRangeFirst.start.ymd(),
      lte: dateRangeLast.end.ymd(),
    },
    displayName: [recurring.transactionDisplayName, recurring.pendingDisplayName],
  };
  const matchingTransactions = await HeathClient.getBankTransactions(
    recurring.bankAccountId,
    query,
    { order: { transactionDate: SortOrder.ASC }, useReadReplica },
  );
  const nonMatchedMatching = matchingTransactions.filter(t => {
    return !alreadyMatchedTransactionIds.includes(BigInt(t.id));
  });

  logger.debug('matching predicted expected transactions', {
    bankAccountId: recurring.bankAccountId,
    recurringTransaction: recurring.id,
    count: nonMatchedMatching.length,
    query,
    useReadReplica,
  });

  // filter out double on same day and ones that don't match user amount
  const uniqueTransactions: BankTransaction[] = _filterAndSortBankTransactions(
    nonMatchedMatching,
    recurring,
  );
  const matchedExpectedTransactions = await _matchAndUpdateExpectedTransactions(
    predicted,
    uniqueTransactions,
    recurring,
  );

  if (!_.isEmpty(matchedExpectedTransactions)) {
    // update missed and try to update schedule on recurring transaction
    metrics.increment(
      Metrics.EXPECTED_TRANSACTION_MATCH_FOUND,
      matchedExpectedTransactions.length,
      { source, type: recurring.type },
    );

    const shouldClearMissed = shouldClearMissedStatus(recurring, matchedExpectedTransactions);
    if (shouldClearMissed) {
      logger.debug('update-to-date transaction found for missed recurring transaction', {
        bankAccountId: recurring.bankAccountId,
        recurringTransaction: recurring.id,
      });
      metrics.increment(Metrics.EXPECTED_TRANSACTION_MATCH_CLEARED_MISSED_STATUS, {
        source,
        type: recurring.type,
      });
      if (recurring.missed !== null && recurring.userAmount > 0) {
        Notifications.notifyIncomeStatusChange(
          recurring,
          recurring.status,
          RecurringTransactionStatus.MISSED,
        );
      }
    }
    await updateRecurringTransaction(recurring, matchedExpectedTransactions, shouldClearMissed);

    const next = await getNextExpectedTransaction(recurring);
    logger.debug('updated reccurring transaction after match', {
      recurringTransactionId: recurring.id,
      nextExpectedId: next.id,
      nextExpectedDate: next.expectedDate,
    });
  }
}

export function shouldClearMissedStatus(
  recurring: RecurringTransaction,
  matched: ExpectedTransaction[],
  today: Moment = moment(),
): boolean {
  if (!_.isNil(recurring.missed) && !_.isEmpty(matched)) {
    // matched expected transactions may be old transactions, only a
    // recent match can clear missed status
    const mostRecent = _.last(_.sortBy(matched, m => m.expectedDate));
    const intervalDays = IntervalDuration[recurring.rsched.interval];
    const windowStart = today.clone().subtract(intervalDays, 'days');
    return (
      windowStart.isSameOrBefore(mostRecent.expectedDate) ||
      (!_.isNil(mostRecent.settledDate) && windowStart.isSameOrBefore(mostRecent.settledDate))
    );
  }
  return false;
}

export function matchedTransactionIds(expectedTransactions: ExpectedTransaction[]): BigInt[] {
  return expectedTransactions
    .filter(et => et.bankTransactionId !== null)
    .map(ex => BigInt(ex.bankTransactionId));
}

export function shouldUpdateRsched(expectedTransactions: ExpectedTransaction[]): boolean {
  return expectedTransactions.some(expected => {
    const transactionDate = expected.settledDate || expected.pendingDate;
    if (transactionDate) {
      const diff = expected.expectedDate.diff(transactionDate, 'days');
      return diff !== 0;
    }
  });
}

/**
 * Set missed to false and try to update the recurring transaction schedule if applicable.
 * @param {RecurringTransaction} recurring
 * @param {ExpectedTransaction[]} matched
 * @returns {Promise<void>}
 */
async function updateRecurringTransaction(
  recurring: RecurringTransaction,
  matched: ExpectedTransaction[],
  shouldClearMissed: boolean,
) {
  let update: UpdateParams = {};
  if (shouldClearMissed) {
    update.missed = null;
  }
  if (shouldUpdateRsched(matched)) {
    const matchingTransactions = await Utils.getMatchingBankTransactions(recurring, moment(), 180);
    const transactionDates = matchingTransactions.map(t => moment(t.transactionDate));
    if (transactionDates.length > 0) {
      const scheduleMatch = getBestScheduleMatch(transactionDates);
      if (scheduleMatch && scheduleMatch.confidence >= RSCHED_CONFIDENCE_THRESHOLD) {
        const newRsched = new RSched(
          scheduleMatch.interval,
          scheduleMatch.params,
          scheduleMatch.rollDirection,
          scheduleMatch.weeklyStart || moment(),
        );
        if (newRsched.id !== recurring.rsched.id) {
          update = {
            missed: null,
            interval: newRsched.interval,
            params: newRsched.params,
            rollDirection: newRsched.rollDirection,
            dtstart: newRsched.weeklyStart.toMoment(),
          };
          await Store.detachExpectedTransactions(recurring);
          await AuditLog.create({
            userId: recurring.userId,
            type: 'UPDATED_RECURRING_TRANSACTION_SCHEDULE',
            successful: true,
            eventUuid: recurring.id,
            message: 'Update the schedule of a recurring transaction',
            extra: {
              scheduleMatch,
              transactionDates,
              oldSchedule: {
                interval: recurring.rsched.interval,
                params: recurring.rsched.params,
                dtstart: recurring.rsched.weeklyStart,
                rollDirection: recurring.rsched.rollDirection,
              },
            },
          });
        }
      }
    } else {
      logger.error('No bank transactions found for recurring match', {
        recurringTransaction: recurring.id,
      });
    }
  }

  await Store.update(recurring.id, update);
}

/**
 * Returns a sorting function for BankTransaction objects that will sort by the time difference
 * away from the provided expected transaction parameter.
 *
 * @param {ExpectedTransaction} expectedTransaction
 * @returns {(transA: BankTransaction, transB) => number}
 */
export function getSortByClosestToExpected(expectedTransaction: ExpectedTransaction) {
  const expected = expectedTransaction.expectedDate;
  return (transA: BankTransaction, transB: BankTransaction) => {
    return (
      Math.abs(moment(transA.transactionDate).diff(expected)) -
      Math.abs(moment(transB.transactionDate).diff(expected))
    );
  };
}

export async function _matchAndUpdateExpectedTransactions(
  expectedTransactions: ExpectedTransaction[],
  bankTransactions: BankTransaction[],
  recurring: RecurringTransaction,
): Promise<ExpectedTransaction[]> {
  // find any close matches and update those transactions
  return Bluebird.reduce(
    expectedTransactions,
    async (matchedTransactions, expectedTransaction) => {
      const expected = expectedTransaction.expectedDate;
      const dateRange = expectedRecurringTransactionWindow(expected, recurring.rsched);
      const matches = bankTransactions
        .filter(trans =>
          moment(trans.transactionDate).isBetween(dateRange.start, dateRange.end, 'day', '[]'),
        )
        .sort(getSortByClosestToExpected(expectedTransaction));
      if (matches.length) {
        const match = matches[0];
        const updated = await _updateFromBankTransaction(expectedTransaction, match, recurring);
        bankTransactions = bankTransactions.filter(t => t.id !== match.id);
        matchedTransactions.push(updated);
      }
      return matchedTransactions;
    },
    [] as ExpectedTransaction[],
  );
}

export function _filterAndSortBankTransactions(
  matchingTransactions: BankTransaction[],
  recurring: RecurringTransaction,
): BankTransaction[] {
  const validTransactions = matchingTransactions
    .filter(trans => Math.sign(trans.amount) === Math.sign(recurring.userAmount))
    .filter(trans => _transactionMatchAmountValid(trans, recurring));

  const closestAmountMatch = (transactions: BankTransaction[]) => {
    return _.first(_.sortBy(transactions, trans => Math.abs(trans.amount - recurring.userAmount)));
  };

  return _.chain(validTransactions)
    .groupBy(t => t.transactionDate)
    .mapValues(closestAmountMatch)
    .sortBy(trans => trans.transactionDate)
    .value();
}

export function _getBankTransactionIdFromUuid(uuidString: string): BigInt {
  // some uuids are in the format '12345'
  const numberString = parseInt(uuidString, 10);
  if (!_.isNaN(numberString)) {
    return BigInt(numberString);
  }

  const uuidBigInt = uuid.lo64(uuidString);
  if (uuidBigInt) {
    return uuidBigInt;
  }

  throw new Error('Invalid UUID');
}

/**
 * Validates a transaction's amount for matching against expectation.
 * Currently only tracks minimum income amount for advance purposes.
 * Future work could be statistical based off previous transactions
 * matched against the same expectation
 *
 * @param {BankTransaction} transaction - transaction to validate
 * @param {RecurringTransaction} recurring - recurrence to match against
 */
function _transactionMatchAmountValid(
  transaction: BankTransaction,
  recurring: RecurringTransaction,
): boolean {
  return recurring.type !== TransactionType.INCOME || transaction.amount >= MINIMUM_INCOME_AMOUNT;
}

export async function _updatePendingExpectedTransactions(
  allExpected: ExpectedTransaction[],
  recurring: RecurringTransaction,
  useReadReplica: boolean = false,
): Promise<ExpectedTransaction[]> {
  const isPending = (expected: ExpectedTransaction) =>
    expected.status === ExpectedTransactionStatus.PENDING;

  return Bluebird.map(allExpected, async expected => {
    if (isPending(expected) && expected.bankTransactionId) {
      const bankTransactions = await HeathClient.getBankTransactions(
        recurring.bankAccountId,
        {
          status: { notIn: [BankTransactionStatus.PENDING] },
          transactionDate: {
            gte: expected.pendingDate.ymd(),
          },
        },
        { useReadReplica },
      );
      const bankTransaction = bankTransactions.find(bt => {
        if (bt.bankTransactionUuid) {
          return (
            _getBankTransactionIdFromUuid(bt.bankTransactionUuid) ===
            BigInt(expected.bankTransactionId)
          );
        }
        return BigInt(bt.id) === BigInt(expected.bankTransactionId);
      });
      if (bankTransaction) {
        return _updateFromBankTransaction(expected, bankTransaction, recurring);
      }
    }
    return expected;
  });
}

export async function _updateFromBankTransaction(
  expectedTransaction: ExpectedTransaction,
  transaction: BankTransaction,
  recurring: RecurringTransaction,
): Promise<ExpectedTransaction> {
  logger.debug('expected transaction match found', {
    recurringTransaction: recurring.id,
    expectedTransaction: expectedTransaction.id,
    bankTransaction: transaction.id,
  });

  let updated: ExpectedTransaction;
  const bankTransactionId = transaction.bankTransactionUuid
    ? _getBankTransactionIdFromUuid(transaction.bankTransactionUuid)
    : BigInt(transaction.id);

  if (transaction.pending) {
    updated = await Store.updateExpectedTransaction(expectedTransaction.id, {
      pendingDate: moment(transaction.transactionDate),
      status: ExpectedTransactionStatus.PENDING,
      pendingAmount: transaction.amount,
      bankTransactionId,
    });
  } else {
    updated = await Store.updateExpectedTransaction(expectedTransaction.id, {
      settledDate: moment(transaction.transactionDate),
      status: ExpectedTransactionStatus.SETTLED,
      settledAmount: transaction.amount,
      bankTransactionId,
    });
  }

  if (
    transaction.pendingDisplayName &&
    transaction.pendingDisplayName !== recurring.pendingDisplayName
  ) {
    await Store.update(recurring.id, { pendingDisplayName: transaction.pendingDisplayName });
  }
  return updated;
}

/**
 * Compute the time window to search in for transactions that match
 * an expected recurring transaction
 * @param expectedDate - expected date of next transaction in recurring series
 * @param schedule - recurring transaction schedule
 */
export function expectedRecurringTransactionWindow(
  expectedDate: Moment,
  schedule: RSched,
): DateRange {
  const prevExpectedDate = schedule.before(expectedDate);
  const minDate = addSettlementGracePeriod(prevExpectedDate);
  const maxDate = addSettlementGracePeriod(expectedDate);
  return moment.range(minDate, maxDate);
}

/**
 * For a given expected transaction date, find the latest acceptable
 * transaction match date, which takes into account buffer time
 * for settlement delay and weekend / holiday roll direction
 */
export function addSettlementGracePeriod(expectedDate: Moment): Moment {
  return nextBankingDay(
    expectedDate.clone().add(TRANSACTION_SETTLEMENT_DAYS, 'days'),
    RollDirection.FORWARD,
  );
}

export function transactionLookBackStartDate(date: Moment = moment()) {
  return date.clone().subtract(2, 'months');
}

function transactionLookForwardEndDate(date: Moment = moment()) {
  return date.clone().add(3, 'days');
}
