import { map } from 'lodash';
import { Moment } from 'moment';
import { ForecastJsonResponse } from '@dave-inc/wire-typings';
import { formatDisplayName, formatExternalName } from '../../lib/format-transaction-name';
import { DEFAULT_TIMEZONE, moment } from '@dave-inc/time-lib';
import { minVersionCheck } from '../../lib/utils';
import { IForecastExpectedTransactionPlain } from '../../typings';
import { BankAccount, UserAppVersion } from '../../models';
import * as RecurringTransactionDomain from '../../domain/recurring-transaction';
import { ExpectedTransaction, RecurringTransaction } from '../../domain/recurring-transaction';
import { BankTransactionResponse } from '@dave-inc/wire-typings';
import HeathClient from '../../lib/heath-client';
import { BankTransactionStatus } from '@dave-inc/heath-client';

export const AVAILABLE_TO_SPEND_MIN_VERSION = '2.12.2';
interface IExpectedTransactionWithOccurred extends ExpectedTransaction {
  occurredTransaction?: BankTransactionResponse;
}

export async function shouldShowAvailableToSpend(userId: number): Promise<boolean> {
  const userAppVersion = await UserAppVersion.findOne({
    where: { userId },
  });

  if (!userAppVersion) {
    return true; // assume that the user is new and will install the latest app version
  }

  const { appVersion, deviceType } = userAppVersion;

  return minVersionCheck({ appVersion, deviceType }, AVAILABLE_TO_SPEND_MIN_VERSION);
}

export async function computeAccountForecastFromBankAccountId(
  bankAccountId: number,
  { startFromPayPeriod = false }: { startFromPayPeriod?: boolean } = {},
): Promise<ForecastJsonResponse | null> {
  const account = await BankAccount.findByPk(bankAccountId);

  // account was deleted;
  if (!account) {
    return null;
  }

  return computeAccountForecast(account, { startFromPayPeriod });
}

/**
 * Expects dates in the form of `YYYY-MM-DD` for `start` and `stop` args.
 */
export async function computeAccountForecast(
  bankAccount: BankAccount,
  { startFromPayPeriod = false }: { startFromPayPeriod?: boolean } = {},
): Promise<ForecastJsonResponse> {
  let start = moment()
    .tz(DEFAULT_TIMEZONE)
    .startOf('day');

  const [pending, nextPaycheck] = await Promise.all([
    HeathClient.getBankTransactions(bankAccount.id, {
      status: BankTransactionStatus.PENDING,
      transactionDate: {
        gte: moment()
          .subtract(14, 'days')
          .ymd(),
      },
    }),
    RecurringTransactionDomain.getNextExpectedPaycheckForAccount(
      bankAccount.id,
      bankAccount.mainPaycheckRecurringTransactionId,
      moment(start),
    ),
  ]);

  let stop: Moment;
  if (nextPaycheck) {
    const income = await RecurringTransactionDomain.getById(nextPaycheck.recurringTransactionId);
    start = await getPreviousStartDate(start, {
      startFromPayPeriod,
      income,
    });

    stop = income.rsched.after(start).subtract(1, 'days');
  } else {
    start = await getPreviousStartDate(start, { startFromPayPeriod });

    stop = start.clone().endOf('month');
  }

  const [expectedAll, transactions] = await Promise.all([
    RecurringTransactionDomain.getExpectedTransactionsByAccountId(
      bankAccount.id,
      start.format('YYYY-MM-DD'),
      stop.format('YYYY-MM-DD'),
    ),
    HeathClient.getBatchedRecentBankTransactions(bankAccount.id, start.format('YYYY-MM-DD')),
  ]);

  // Occurred expected should be popped out.
  const expected = expectedAll.filter(
    expectedTxn => !expectedTxn.pendingDate && !expectedTxn.settledDate,
  );

  const recurringByName: { [key: string]: IExpectedTransactionWithOccurred } = {};
  expected.forEach(trans => (recurringByName[trans.displayName] = trans));

  transactions
    .filter(trans => trans.amount < 0)
    .forEach(transaction => {
      if (recurringByName[transaction.displayName]) {
        recurringByName[transaction.displayName].occurredTransaction = transaction;
      }
    });

  // Split pending transactions as income and expenses
  const pendingIncome = pending.filter(pend => pend.amount > 0);
  const pendingExpense = pending.filter(pend => pend.amount <= 0);

  // Put recurring expenses and income into buckets by day
  const expectedByDay = expected.reduce(
    (acc, expectedTxn) => {
      const date = expectedTxn.expectedDate.format('YYYY-MM-DD');
      if (!acc[expectedTxn.type][date]) {
        acc[expectedTxn.type][date] = [];
      }

      acc[expectedTxn.type][date].push(expectedTxn);

      return acc;
    },
    { INCOME: {}, EXPENSE: {} } as {
      INCOME: { [key: string]: IExpectedTransactionWithOccurred[] };
      EXPENSE: { [key: string]: IExpectedTransactionWithOccurred[] };
    },
  );

  // Start the accumulator and lowest balance at the current balance
  let accumulatingBalance = bankAccount.current || 0;
  let lowestBalance = bankAccount.current || 0;

  // For every day starting tomorrow, add the recurring expenses,
  // maybe record that as the new minimum balance, and then add the income
  const today = start;
  const stopPlusOne = moment(stop).add(1, 'days');

  const isDaveBanking = await bankAccount.isDaveBanking();

  Array.from(moment.range(today, stopPlusOne).by('day')).forEach((day: Moment) => {
    // Add the recurring expenses to the accumulated balance
    accumulatingBalance += (expectedByDay.EXPENSE[day.format('YYYY-MM-DD')] || []).reduce(
      (acc, expense) => acc + expense.expectedAmount,
      0,
    );

    if (day.isSame(today) && !isDaveBanking) {
      accumulatingBalance += pendingExpense.reduce((acc, expense) => acc + expense.amount, 0);
    }

    lowestBalance = Math.min(lowestBalance, accumulatingBalance);

    if (day.isSame(today)) {
      accumulatingBalance += pendingIncome.reduce((acc, pendIncome) => acc + pendIncome.amount, 0);
    }

    // Add the recurring income to the accumulated balance
    accumulatingBalance += (expectedByDay.INCOME[day.format('YYYY-MM-DD')] || []).reduce(
      (acc, recIncome) => acc + recIncome.expectedAmount,
      0,
    );
  });

  const paycheck = nextPaycheck ? expectedTransactionToPlain(nextPaycheck) : null;
  const recurring = expected.map(expectedTransactionToPlain);
  return {
    id: null,
    userId: bankAccount.userId,
    bankAccountId: bankAccount.id,
    startBalance: bankAccount.current || 0,
    lowestBalance,
    pending: pending
      .filter(transaction => moment().diff(transaction.transactionDate, 'days') >= -7)
      .map(transaction => {
        return {
          id: transaction.id,
          amount: transaction.amount,
          date: transaction.transactionDate,
          displayName: transaction.displayName,
          userFriendlyName: formatExternalName(transaction.externalName),
        };
      }),
    start: start.format('YYYY-MM-DD'),
    stop: stop.format('YYYY-MM-DD'),
    paycheck: paycheck
      ? {
          ...paycheck,
          occurredTransaction: paycheck.occurredTransaction,
        }
      : null,
    recurring: map(recurring, (recurr: IForecastExpectedTransactionPlain) => ({
      ...recurr,
      occurredTransaction: recurr.occurredTransaction,
    })),
    created: null,
    updated: null,
  };
}

function expectedTransactionToPlain(
  prediction: IExpectedTransactionWithOccurred,
): IForecastExpectedTransactionPlain {
  return {
    id: prediction.id,
    amount: prediction.expectedAmount,
    date: prediction.expectedDate.format('YYYY-MM-DD'),
    displayName: prediction.displayName,
    userFriendlyName: formatDisplayName(prediction.displayName),
    occurredTransaction: prediction.occurredTransaction,
    recurringTransactionId: prediction.recurringTransactionId,
  };
}

async function getPreviousStartDate(
  today: Moment,
  {
    income = null,
    startFromPayPeriod,
  }: {
    income?: RecurringTransaction | null;
    startFromPayPeriod: boolean;
  },
): Promise<Moment> {
  if (!startFromPayPeriod) {
    return today;
  }

  if (!income) {
    return moment()
      .tz(DEFAULT_TIMEZONE)
      .startOf('month');
  }

  const expectedStartOfPayPeriod = income.rsched.before(moment().tz(DEFAULT_TIMEZONE));

  const daysSinceExpectedStart = moment()
    .tz(DEFAULT_TIMEZONE)
    .diff(expectedStartOfPayPeriod, 'days');

  const lastOneOrTwoPaycheckOccurrences = await RecurringTransactionDomain.getMatchingBankTransactions(
    income,
    moment().tz(DEFAULT_TIMEZONE),
    daysSinceExpectedStart + 2,
  );

  if (!lastOneOrTwoPaycheckOccurrences.length) {
    return expectedStartOfPayPeriod;
  }

  const [lastPaycheckObservation] = lastOneOrTwoPaycheckOccurrences.sort((a, b) =>
    moment(b.transactionDate).diff(a.transactionDate),
  );

  return moment(lastPaycheckObservation.transactionDate);
}
