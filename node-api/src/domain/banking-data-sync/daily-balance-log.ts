import * as Bluebird from 'bluebird';
import * as _ from 'lodash';
import { BankAccount, BankConnection, Payment } from '../../models';
import { BalanceLogCaller, BankAccountBalances, DailyBalanceLike } from '../../typings';
import { Moment } from 'moment';
import { moment } from '@dave-inc/time-lib';
import { Op } from 'sequelize';
import { BankingDataSource, ExternalTransactionStatus } from '@dave-inc/wire-typings';
import HeathClient from '../../lib/heath-client';
import { BalanceLogInput } from '@dave-inc/heath-client';

/**
 * Private helper used to backfill daily balance log from our transaction history
 */
async function _calculateEodBalance(
  date: Moment,
  bankAccountId: number,
  nextEodBalance: BankAccountBalances,
) {
  const tomorrow = moment(date)
    .add(1, 'day')
    .format('YYYY-MM-DD');
  const transactions = await HeathClient.getBankTransactions(bankAccountId, {
    transactionDate: tomorrow,
  });

  // TODO: use institution.balanceIncludesPending
  // if no transactions are found, current and available will be equal to nextEodBalance

  // available balance: available balance at end of next day minus all of next day's transactions
  const available = transactions.reduce((acc, t) => acc - t.amount, nextEodBalance.available);

  let current;
  if (nextEodBalance.current === nextEodBalance.available) {
    // current balance: if the balance at the end of the next day is the same, the balance at the end of the current day is also the same
    current = available;
  } else {
    // current balance: current balance at end of next day minus all of next day's posted transactions
    current = transactions
      .filter(t => t.pending === false)
      .reduce((acc, t) => acc - t.amount, nextEodBalance.current);
  }

  return { current, available };
}

/**
 * Backfills daily balance rows for provided bank account
 *
 * @param {Number} bankAccount - pkey of a row in bank_account table
 * @param {Moment} lastUpdated - the last time the account was updated
 * @param {BankingDataSource} bankingDataSource - source
 * @param {BalanceLogCaller} caller - the action that created this instance
 *
 * @returns {Object} dates - returns hash of {'YYYY-MM-DD': {current: <Number, available> <Number>} }
 */
export async function backfillDailyBalances(
  bankAccount: BankAccount,
  caller: BalanceLogCaller,
  bankingDataSource?: BankingDataSource,
  lastUpdated?: Moment,
) {
  // starting point should be last known balance via bank_account
  if (_.isNil(bankAccount.current) && _.isNil(bankAccount.available)) {
    return;
  }
  const lastbankAccountUpdate = moment(bankAccount.updated).startOf('day');
  const lastWebhookUpdate = lastUpdated
    ? lastUpdated
    : moment()
        .subtract(6, 'weeks')
        .startOf('day');

  // account is not being updated I don't know why it isn't deleted
  const notBeingUpdated = lastbankAccountUpdate.isBefore(lastWebhookUpdate);

  // no need to backfill if we have a recent webhook update
  if (moment().diff(lastWebhookUpdate, 'days') < 2 || notBeingUpdated) {
    return;
  }

  // work backwards from bank_account balances
  const dateRange = moment.range(lastWebhookUpdate, lastbankAccountUpdate);
  const daysToFill: Moment[] = Array.from<Moment>(
    dateRange.by('day', { exclusive: true }),
  ).reverse();

  const newLogEntries = await Bluebird.reduce(
    daysToFill,
    async (entries, day, i) => {
      if (i === 0) {
        entries[day.format()] = await _calculateEodBalance(day, bankAccount.id, {
          current: bankAccount.current,
          available: bankAccount.available || bankAccount.current,
        });
      } else {
        // calculate from previous log entry
        entries = await entries;
        entries[day.format()] = await _calculateEodBalance(
          day,
          bankAccount.id,
          // previously-inserted hash slot
          entries[daysToFill[i - 1].format()],
        );
      }
      return entries;
    },
    {} as Record<string, { available: number; current: number }>,
  );

  const balanceLogs = daysToFill.map(day => {
    const current = newLogEntries[day.format()].current;
    const available = newLogEntries[day.format()].available;
    return {
      bankAccountId: bankAccount.id,
      userId: bankAccount.userId,
      bankConnectionId: bankAccount.bankConnectionId,
      processorAccountId: bankAccount.externalId,
      processorName: bankingDataSource,
      current: isNaN(current) ? null : current,
      available: isNaN(available) ? null : available,
      date: day.format('YYYY-MM-DD'),
      timestamp: day.endOf('day'),
      caller,
    };
  });
  await Bluebird.each(balanceLogs, async log => {
    await HeathClient.saveBalanceLogs(log);
  });
}

export async function updateBalanceLogs(
  bankConnection: BankConnection,
  bankAccounts: BankAccount[],
  caller: BalanceLogCaller,
): Promise<void> {
  await Bluebird.each(bankAccounts, async bankAccount => {
    const available = isNaN(bankAccount.available) ? null : bankAccount.available;
    const current = isNaN(bankAccount.current) ? null : bankAccount.current;

    const balanceData: BalanceLogInput = {
      bankAccountId: bankAccount.id,
      userId: bankConnection.userId,
      bankConnectionId: bankConnection.id,
      processorAccountId: bankAccount.externalId,
      processorName: bankConnection.bankingDataSource,
      available,
      current,
      date: moment().format('YYYY-MM-DD'),
      caller,
    };
    await HeathClient.saveBalanceLogs(balanceData, Date.now());
  });
}

/**
 * Filters along a date range (inclusive)
 * @param {number} bankAccountId
 * @param {string} startString
 * @param {string} endString
 * @param {boolean} excludeDavePayments
 * @returns {Promise<DailyBalanceLike[]>}
 */
export async function getByDateRange(
  bankAccountId: number,
  startString: string,
  endString: string,
  excludeDavePayments = false,
): Promise<DailyBalanceLike[]> {
  const start = moment(startString, 'YYYY-MM-DD');
  const end = moment(endString, 'YYYY-MM-DD');
  const recordedBalances = await HeathClient.getBalanceLogs(bankAccountId, {
    start,
    end,
  });

  const filledBalances = await _fillDailyBalanceGaps(
    bankAccountId,
    recordedBalances.map(bal => {
      return {
        date: bal.date,
        available: bal.available,
        current: bal.current,
      };
    }),
    startString,
    endString,
  );
  /*
   * If excludeDavePayments we find the users dave payments and add the amount
   * to available and current balance for the given data range
   */
  if (excludeDavePayments) {
    return excludeDavePaymentsFromBalances(filledBalances, startString, endString, bankAccountId);
  }

  return filledBalances;
}

/**
 * Fill the gaps in a range daily balance rows
 * Missing days/rows indicate there were no transactions, so roll the previous day's balance forward
 */
async function _fillDailyBalanceGaps(
  bankAccountId: number,
  balances: DailyBalanceLike[],
  startDate: string,
  stopDate: string,
) {
  if (balances.length === 0) {
    return balances;
  }

  const firstFoundDay = moment(balances[0].date);

  // general moment notes:
  // b occurs after a
  // a.diff(b) will be positive
  // b.diff(a) will be negative

  // gap in record preceeds rows found
  // e.g.
  // startDate of 2017-10-31 and results beginning [ 2017-11-2, ... ]
  // we need to fill in ??s by looking backwards until 1 result is found [ ??, ??, 2017-11-2, ...]
  // limit to 31 days of lookback
  const inferredBalances = balances.slice();
  if (moment(startDate).diff(firstFoundDay, 'days') < 0) {
    const previousDay = moment(balances[0].date).subtract(1, 'day');
    const monthAgo = moment(balances[0].date).subtract(31, 'day');
    const lastMonthBalances = await HeathClient.getBalanceLogs(bankAccountId, {
      start: monthAgo,
      end: previousDay,
    });

    if (lastMonthBalances.length > 0) {
      const preceeding = _fillBackwards(
        lastMonthBalances.map(bal => {
          return {
            date: bal.date,
            available: bal.available,
            current: bal.current,
          };
        }),
        moment(balances[0].date).subtract(1, 'day'),
        bankAccountId,
      );
      inferredBalances.unshift(...preceeding.reverse());
    }
  }

  return _fillForwards(inferredBalances, bankAccountId, startDate, stopDate);
}

function _fillBackwards(
  lastMonthBalances: DailyBalanceLike[],
  start: Moment,
  bankAccountId: number,
  scanned: string[] = [],
): DailyBalanceLike[] {
  const result = _.find(lastMonthBalances, b => b.date === start.format('YYYY-MM-DD'));
  // no result found, continue stepping backwards by 1 day
  if (!result) {
    const previousDay = moment(start).subtract(1, 'day');
    return _fillBackwards(lastMonthBalances, previousDay, bankAccountId, [
      ...scanned,
      start.format('YYYY-MM-DD'),
    ]);
  } else {
    // last known balance found, generate row-like objects for all days scanned
    return scanned.reduce(
      (acc, day) => {
        return [
          ...acc,
          {
            date: day,
            available: acc[0].available,
            current: acc[0].current,
          },
        ];
      },
      [
        {
          date: result.date,
          available: result.available,
          current: result.current,
        },
      ],
    );
  }
}

function _fillForwards(
  balances: DailyBalanceLike[],
  bankAccountId: number,
  startDate: string,
  stopDate: string,
) {
  const start = moment(startDate, 'YYYY-MM-DD');
  const stop = moment(stopDate, 'YYYY-MM-DD');

  const dateRange = moment.range(start, stop);
  const days: Moment[] = Array.from(dateRange.by('day'));

  // fill in gaps where 0th item is guaranteed to occur on startDate
  // e.g. [2017-11-1, ??, ??, 2017-11-4]
  return _.compact(
    days.map(day => {
      return _findLastKnownBalance(
        balances,
        days,
        day.format('YYYY-MM-DD'),
        day.format('YYYY-MM-DD'),
      );
    }),
  );
}

function _findLastKnownBalance(
  balances: DailyBalanceLike[],
  days: Moment[],
  cursorDate: string,
  forDate: string,
): DailyBalanceLike {
  const found = _.find(balances, b => b.date === cursorDate);
  const findable = days.map(b => b.format('YYYY-MM-DD')).includes(cursorDate);

  if (!findable) {
    return;
  }
  if (!found) {
    return _findLastKnownBalance(
      balances,
      days,
      moment(cursorDate)
        .subtract(1, 'days')
        .format('YYYY-MM-DD'),
      forDate,
    );
  } else {
    return {
      date: forDate,
      available: found.available,
      current: found.current,
    };
  }
}

export async function excludeDavePaymentsFromBalances(
  balances: DailyBalanceLike[],
  start: string,
  stop: string,
  bankAccountId: number,
): Promise<DailyBalanceLike[]> {
  const bankAccount = await BankAccount.findByPk(bankAccountId);
  const payments = await Payment.findAll({
    where: {
      status: ExternalTransactionStatus.Completed,
      [Op.or]: [{ bankAccountId }, { bankAccountId: null }],
      userId: bankAccount.userId,
      bankTransactionId: {
        [Op.not]: null,
      },
    },
  });
  const bankTransactions = await HeathClient.getBankTransactions(bankAccountId, {
    id: payments.map(p => p.bankTransactionId),
    transactionDate: { gte: start, lte: stop },
  });

  for (const payment of payments) {
    const bankTransaction = bankTransactions.find(b => b.id === payment.bankTransactionId);
    for (const balance of balances) {
      if (bankTransaction && bankTransaction.transactionDate <= balance.date) {
        balance.current += Math.abs(payment.amount);
        if (balance.available !== null) {
          balance.available += Math.abs(payment.amount);
        }
      }
    }
  }

  return balances;
}
