import ErrorHelper from '@dave-inc/error-helper';
import { AuditLog, BankAccount, ExpectedTransaction, RecurringTransaction } from '../../../models';
import { FindOptions, Op } from 'sequelize';
import { moment } from '@dave-inc/time-lib';
import { Moment } from 'moment';
import { ExpectedTransactionStatus } from '../../../models/expected-transaction';
import Notifications from '../notifications';
import { getByRecurringTransaction } from '../generators';
import { getMatchByAmount, getMatchByName } from '../match-quality-score';
import {
  expectedRecurringTransactionWindow,
  matchedTransactionIds,
  transactionLookBackStartDate,
} from '../match-expected-transactions';
import { metrics, RecurringTransactionMetrics } from '../metrics';
import { Cron, DaveCron } from '../../../crons/cron';
import logger from '../../../lib/logger';
import { streamFindAll } from '../../../lib/sequelize-helpers';
import { RecurringTransactionInterval } from '@dave-inc/wire-typings';
import { RecurringTransactionStatus } from '../../../typings';
import HeathClient from '../../../lib/heath-client';
import { BankTransaction } from '@dave-inc/heath-client';

const AMOUNT_MATCH_MINIMUM_RATIO = 0.5;
const MIN_NB_OF_DAY = 6;
const MAX_NB_OF_DAY = 2;

export async function markRecurringTransactionsAsMissed() {
  logger.info('Updating recurring transactions that have not been seen');

  const expensesUdpated = await updateExpenses();
  logger.info(`Updated ${expensesUdpated} overdue recurring expenses`);

  const incomesUpdated = await updateIncomes();
  logger.info(`Updated ${incomesUpdated} overdue recurring incomes`);
}

function updateIncomes(): Promise<number> {
  return streamOverdueExpectedIncome(async (expected: ExpectedTransaction, offset: number) => {
    try {
      if (offset % 1000 === 0) {
        logger.info(`processed ${offset} incomes`);
      }

      metrics.increment(RecurringTransactionMetrics.MARK_MISSED_CHECKED, {
        type: expected.recurringTransaction.type,
      });
      const match = await findMatchingBankTransaction(expected);
      if (match) {
        return await updateExpectedWithMatch(expected, match);
      }

      await setMissedStatus(expected.recurringTransaction);
      await expected.recurringTransaction.reload();

      metrics.increment(RecurringTransactionMetrics.MARK_MISSED_MISSED, {
        type: expected.recurringTransaction.type,
      });

      await _sendAlertIfLastMainPaycheck(expected);
    } catch (error) {
      logger.error('Error marking missing recurring transaction', {
        error: ErrorHelper.logFormat(error),
        recurringTransactionId: expected.recurringTransactionId,
        expectedTransactionId: expected.id,
      });
      metrics.increment(RecurringTransactionMetrics.MARK_MISSED_ERROR, {
        type: expected.recurringTransaction.type,
      });
    }
  });
}

/**
 * Build a set of query conditions for recurring transactions to consider
 * when processing pending-missed expected transactions
 *
 * Query includes:
 * - any active recurring transactions
 * - transactions marked as "missed", but only recently, where recently is
 *   defined as roughly 2 * interval
 */
function recurringTransactionLookBackCondition(numCycles: number, date: Moment) {
  // Create a query condition for a set of intervals and how many days to look
  // back
  const endDate = date.clone().startOf('day');
  const intervalCondition = (intervals: RecurringTransactionInterval[], days: number) => {
    const daysBack = numCycles * days;
    const conditionDate = endDate.clone().subtract(daysBack, 'days');
    return {
      [Op.and]: {
        interval: {
          [Op.in]: intervals,
        },
        missed: {
          [Op.between]: [conditionDate.startOf('day'), endDate],
        },
      },
    };
  };

  const halfMonthIntervals = [
    RecurringTransactionInterval.BIWEEKLY,
    RecurringTransactionInterval.SEMI_MONTHLY,
  ];
  const monthlyIntervals = [
    RecurringTransactionInterval.MONTHLY,
    RecurringTransactionInterval.WEEKDAY_MONTHLY,
  ];
  return {
    [Op.or]: [
      {
        missed: null as Moment,
      },
      intervalCondition([RecurringTransactionInterval.WEEKLY], 7),
      intervalCondition(halfMonthIntervals, 15),
      intervalCondition(monthlyIntervals, 30),
    ],
  };
}

export function streamOverdueExpectedIncome(
  processor: (transaction: ExpectedTransaction, offset: number) => Promise<any> | any,
  date: Moment = moment(),
): Promise<number> {
  // max date is a rougher bound, subject to further narrowing by the
  // settlement date grace period for each expected transaction
  const minDate = date.clone().subtract(MIN_NB_OF_DAY, 'days');
  const maxDate = date.clone().subtract(MAX_NB_OF_DAY, 'days');
  const lookBackCycles = 2;
  const query: FindOptions = {
    where: {
      settledDate: null as Moment,
      pendingDate: null as Moment,
      expectedDate: {
        [Op.between]: [minDate.format('YYYY-MM-DD'), maxDate.format('YYYY-MM-DD')],
      },
      expectedAmount: { [Op.gt]: 0 },
    },
    include: [
      {
        model: RecurringTransaction.scope('verified'),
        where: recurringTransactionLookBackCondition(lookBackCycles, date),
      },
    ],
    order: [['expectedDate', 'ASC']],
  };

  return streamFindAll<ExpectedTransaction>(ExpectedTransaction, query, processor);
}

export async function findMatchingBankTransaction(
  expected: ExpectedTransaction,
): Promise<BankTransaction> {
  const acceptableMinimumMatchAmount = AMOUNT_MATCH_MINIMUM_RATIO * expected.expectedAmount;
  const rsched = expected.recurringTransaction.rsched;
  const dateRange = expectedRecurringTransactionWindow(expected.expectedDate, rsched);

  const relatedExpected = await getByRecurringTransaction(
    expected.recurringTransaction,
    transactionLookBackStartDate(expected.expectedDate),
    dateRange.end,
  );
  const alreadyMatchedTransactionIds = matchedTransactionIds(relatedExpected);

  const transactions = await HeathClient.getBankTransactions(expected.bankAccountId, {
    amount: {
      gte: acceptableMinimumMatchAmount,
    },
    transactionDate: {
      gte: dateRange.start.format('YYYY-MM-DD'),
      lte: dateRange.end.format('YYYY-MM-DD'),
    },
  });
  const nonMatchedTransactions = transactions.filter(t => {
    return !alreadyMatchedTransactionIds.includes(BigInt(t.id));
  });

  const nameMatch = getMatchByName(
    expected,
    nonMatchedTransactions,
    expected.recurringTransaction.transactionDisplayName,
  );

  if (nameMatch) {
    logger.info('overdue recurring transaction name match', {
      expectedTransaction: expected.id,
      name: nameMatch.displayName,
    });
    metrics.increment(RecurringTransactionMetrics.MARK_MISSED, {
      status: 'name_match',
      type: expected.recurringTransaction.type,
    });
    return nameMatch;
  }

  const amountMatch = await getMatchByAmount(expected, expected.recurringTransaction, transactions);

  if (amountMatch) {
    logger.info('overdue recurring transaction amount match', {
      expectedTransaction: expected.id,
      amount: amountMatch.amount,
    });
    metrics.increment(RecurringTransactionMetrics.MARK_MISSED, {
      status: 'amount_match',
      type: expected.recurringTransaction.type,
    });
  } else {
    metrics.increment(RecurringTransactionMetrics.MARK_MISSED, {
      status: 'no_match',
      type: expected.recurringTransaction.type,
    });
  }

  return amountMatch;
}

export function updateExpenses(): Promise<number> {
  // for expenses just loop through and mark all missed since they aren't used
  const query: FindOptions = {
    where: {
      settledDate: null,
      pendingDate: null,
      expectedDate: {
        [Op.between]: [
          moment()
            .subtract(8, 'days')
            .format('YYYY-MM-DD'),
          moment()
            .subtract(2, 'days')
            .format('YYYY-MM-DD'),
        ],
      },
      expectedAmount: { [Op.lt]: 0 },
    },
    include: [
      {
        model: RecurringTransaction,
        where: {
          missed: null,
        },
      },
    ],
  };

  const processor = async (expected: ExpectedTransaction, offset: number) => {
    if (offset % 1000 === 0) {
      logger.info(`processed ${offset} expenses`);
    }
    await setMissedStatus(expected.recurringTransaction);
  };
  return streamFindAll<ExpectedTransaction>(ExpectedTransaction, query, processor);
}

const SEQUELIZE_UNIQUE_CONSTRAINT_ERROR = 'SequelizeUniqueConstraintError';

async function updateExpectedWithMatch(expected: ExpectedTransaction, match: BankTransaction) {
  if (match.pending) {
    await expected.update({
      pendingDate: match.transactionDate,
      pendingAmount: match.amount,
      pendingDisplayName: match.displayName,
      status: ExpectedTransactionStatus.PENDING,
      bankTransactionId: match.id,
    });
    await expected.recurringTransaction.update({
      missed: null,
      pendingDisplayName: match.displayName,
    });
  } else {
    try {
      if (match.displayName !== expected.recurringTransaction.transactionDisplayName) {
        await expected.recurringTransaction.update({
          possibleNameChange: expected.recurringTransaction.transactionDisplayName,
          transactionDisplayName: match.displayName,
          missed: null,
        });
      } else {
        await expected.recurringTransaction.update({ missed: null });
      }
      await expected.update({
        settledDate: match.transactionDate,
        settledAmount: match.amount,
        status: ExpectedTransactionStatus.SETTLED,
        bankTransactionId: match.id,
      });
      metrics.increment(RecurringTransactionMetrics.MARK_MISSED_NAME_CHANGED, {
        type: expected.recurringTransaction.type,
      });
    } catch (err) {
      // Happens if the user already has a recurring transaction set for the name change.
      if (err.name === SEQUELIZE_UNIQUE_CONSTRAINT_ERROR) {
        metrics.increment(RecurringTransactionMetrics.MARK_MISSED_MISSED, {
          type: expected.recurringTransaction.type,
        });
        await setMissedStatus(expected.recurringTransaction);
        await expected.recurringTransaction.reload();

        await _sendAlertIfLastMainPaycheck(expected);
      } else {
        throw err;
      }
    }
  }
  await AuditLog.create({
    userId: expected.userId,
    type: 'RECURRING_TRANSACTION_NAME_CHANGE',
    successful: true,
    eventUuid: expected.recurringTransaction.id,
    message: 'Found name change for a recurring transaction',
    extra: {
      expectedId: expected.id,
      expectedName: expected.recurringTransaction.transactionDisplayName,
      foundName: match.displayName,
      expectedAmount: expected.expectedAmount,
      foundAmount: match.amount,
    },
  });
}

async function _sendAlertIfLastMainPaycheck(expectedTransaction: ExpectedTransaction) {
  // we only want to send a notification once we're sure the recurring payment
  // won't be coming
  if (moment().diff(expectedTransaction.expectedDate, 'days') < MIN_NB_OF_DAY) {
    return;
  }

  const recurringTransaction = expectedTransaction.recurringTransaction;
  const accounts = await BankAccount.findAll({
    where: {
      userId: recurringTransaction.userId,
    },
    include: [
      {
        model: RecurringTransaction,
        as: 'mainPaycheckRecurringTransaction',
      },
    ],
  });

  for (const acc of accounts) {
    const main = acc.mainPaycheckRecurringTransaction;
    if (main && !main.missed && main.id !== recurringTransaction.id) {
      return;
    }
  }

  await Notifications.sendTransactionMissed(recurringTransaction);
}

async function setMissedStatus(
  recurringTransaction: RecurringTransaction,
  missedTime: Moment = moment(),
): Promise<void> {
  if (recurringTransaction.missed === null) {
    await recurringTransaction.update({
      missed: missedTime,
    });

    if (recurringTransaction.userAmount > 0) {
      Notifications.notifyIncomeStatusChange(
        recurringTransaction,
        RecurringTransactionStatus.MISSED,
        recurringTransaction.status,
      );
    }
  }
}

export const MarkRecurringTransactionsAsMissed: Cron = {
  name: DaveCron.MarkRecurringTransactionsAsMissed,
  process: markRecurringTransactionsAsMissed,
  schedule: '0 8 * * *',
};
