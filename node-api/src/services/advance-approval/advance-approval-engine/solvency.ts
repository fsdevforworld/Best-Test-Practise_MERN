import { BankTransaction } from '@dave-inc/heath-client';
import * as Bluebird from 'bluebird';
import { DateOnly, moment } from '@dave-inc/time-lib';
import * as _ from 'lodash';
import { getAvailableOrCurrentBalance } from '../../../lib/utils';
import { getByDateRange } from '../../../domain/banking-data-sync';

/**
 * Returns a boolean expressing the bank account's solvency n1 days after n2 paydays
 * @params {Number} bankAccountId
 * @params {Array} pastPaychecks - the raw.observations field of a prediction
 * @params {Object} options - (optional)
 * @params {Number} options.paychecks - n number of historical paydays to run solvency check on
 * @params {Number} options.days - n number of days balance must be above minBalance on/after payday
 * @params {Number} options.minBalance - minimum EoD balance required to pass solvency check
 * @params {Number} options.excludeDavePayments - true|false. If true the payment(s) to Dave shouldn't lower their daily balance (add the payment back to the users daily balance).
 */
export async function historicalPaydaySolvency(
  bankAccountId: number,
  pastPaychecks: BankTransaction[] = [],
  options = {
    paychecks: 1,
    days: 1,
    minBalance: 115,
    excludeDavePayments: true,
    businessDaysOnly: false,
  },
): Promise<boolean> {
  const paychecks = pastPaychecks.slice(0, options.paychecks);
  const aboveThreshold = await Bluebird.map(paychecks, async paycheck => {
    const start = moment(paycheck.transactionDate).format('YYYY-MM-DD');
    let limit = moment(paycheck.transactionDate)
      .add(options.days, 'days')
      .format('YYYY-MM-DD');
    if (options.businessDaysOnly) {
      limit = DateOnly.fromString(limit)
        .nextBankingDay()
        .toString();
    }

    return daysAboveThreshold(
      bankAccountId,
      options.minBalance,
      start,
      limit,
      options.excludeDavePayments,
    );
  });

  return _.sum(aboveThreshold) >= options.days * options.paychecks;
}

/**
 * Get the max account balance for the 2 days starting on the day of the last paycheck. This is the number we use to
 * check solvency.
 *
 * @param {number} bankAccountId
 * @param {BankTransaction} lastPaycheck
 * @param {boolean} excludeDavePayments
 * @param {boolean} businessDaysOnly
 * @returns {Promise<number>}
 */
export async function lastPaycheckTwoDayMaxAccountBalance(
  bankAccountId: number,
  lastPaycheck: BankTransaction,
  { excludeDavePayments, businessDaysOnly } = {
    excludeDavePayments: true,
    businessDaysOnly: false,
  },
): Promise<number> {
  if (!lastPaycheck) {
    return;
  }
  const startDate = lastPaycheck.transactionDate;
  let endDate = moment(lastPaycheck.transactionDate)
    .add(1, 'day')
    .format('YYYY-MM-DD');
  if (businessDaysOnly) {
    endDate = DateOnly.fromString(endDate)
      .nextBankingDay()
      .toString();
  }

  return maximumAvailableBalance(bankAccountId, { startDate, endDate, excludeDavePayments });
}

/**
 * Get the maximum available balance between the provided start and end date.
 *
 * @param {number} bankAccountId
 * @param {string} startDate
 * @param {string} stopDate
 * @param {boolean} excludeDavePayments
 * @returns {Promise<number>}
 */
export async function maximumAvailableBalance(
  bankAccountId: number,
  {
    startDate,
    endDate,
    excludeDavePayments = true,
  }: {
    startDate: string;
    endDate: string;
    excludeDavePayments?: boolean;
  },
): Promise<number> {
  const dailyBalances = await getByDateRange(
    bankAccountId,
    startDate,
    endDate,
    excludeDavePayments,
  );

  return dailyBalances.reduce(
    (acc, balance) => {
      const available = getAvailableOrCurrentBalance(balance);
      return Math.max(available, acc);
    },
    dailyBalances[0] ? getAvailableOrCurrentBalance(dailyBalances[0]) : 0,
  );
}

/**
 * Returns the number of days bank account maintained a minimum balance between startDate and stopDate
 *
 * @param {number} bankAccountId
 * @param {Number} threshold - minimum balance to be maintained
 * @param {String} startDate YYYY-MM-DD
 * @param {String} stopDate YYYY-MM-DD (inclusive)
 * @param {boolean} excludeDavePayments
 * @param {boolean} consecutiveOnly
 * @returns {Promise<any | number | number>} max number of consecutive days balance was above threshold
 */
export async function daysAboveThreshold(
  bankAccountId: number,
  threshold: number,
  startDate: string,
  stopDate: string,
  excludeDavePayments = true,
  consecutiveOnly = true,
) {
  const dailyBalances = await getByDateRange(
    bankAccountId,
    startDate,
    stopDate,
    excludeDavePayments,
  );
  const balancesAboveThreshold = dailyBalances.reduce(
    (acc, balance) => {
      if ((balance.available || balance.current) >= threshold) {
        const currConsecutive = acc.currConsecutive + 1;
        const maxConsecutive = Math.max(acc.maxConsecutive, currConsecutive);
        return { currConsecutive, maxConsecutive, count: acc.count + 1 };
      } else {
        return { currConsecutive: 0, maxConsecutive: acc.maxConsecutive, count: acc.count };
      }
    },
    { maxConsecutive: 0, currConsecutive: 0, count: 0 },
  );

  return consecutiveOnly ? balancesAboveThreshold.maxConsecutive : balancesAboveThreshold.count;
}
