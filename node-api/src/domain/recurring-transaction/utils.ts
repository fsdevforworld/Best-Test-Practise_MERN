import { identity } from 'lodash';
import { Moment } from 'moment';
import { moment } from '@dave-inc/time-lib';
import { RSched } from '../../lib/recurring-schedule';
import { BankAccount } from '../../models';
import { IntervalDuration, MINIMUM_INCOME_AMOUNT } from './constants';
import { RSchedArgParams, RecurringTransaction, LookbackPeriod } from './types';
import HeathClient from '../../lib/heath-client';
import { QueryFilter, BankTransaction } from '@dave-inc/heath-client';

export function isPaycheck(recurringTransaction: RecurringTransaction): boolean {
  return recurringTransaction.userAmount > 0;
}

export function getNextOccurrence(
  recurringTransaction: RecurringTransaction,
  today: Moment = moment(),
): string {
  const notInclusive = false;
  return moment(recurringTransaction.rsched.after(today, notInclusive)).format('YYYY-MM-DD');
}

export function getLastOccurrence(
  recurringTransaction: RecurringTransaction,
  today: Moment = moment(),
): string {
  const inclusive = true;
  return moment(recurringTransaction.rsched.before(today, inclusive)).format('YYYY-MM-DD');
}

export async function getMatchingBankTransactions(
  recurringTransaction: RecurringTransaction,
  today: Moment = moment(),
  lookbackPeriod: number = LookbackPeriod.Default,
  useReadReplica: boolean = false,
): Promise<BankTransaction[]> {
  const filter: QueryFilter = {
    displayName: {
      in: [
        recurringTransaction.transactionDisplayName,
        recurringTransaction.pendingDisplayName,
        recurringTransaction.userDisplayName,
      ].filter(identity),
    },
  };

  if (lookbackPeriod !== LookbackPeriod.EntireHistory) {
    const start = today.clone().subtract(lookbackPeriod, 'days');
    filter.transactionDate = {
      gte: start.ymd(),
      lte: today.ymd(),
    };
  }

  // We are going to remove some small amounts from incomes
  if (recurringTransaction.userAmount > 0) {
    filter.amount = {
      gt: recurringTransaction.userAmount > MINIMUM_INCOME_AMOUNT ? MINIMUM_INCOME_AMOUNT : 0,
    };
  } else {
    filter.amount = {
      lt: 0,
    };
  }

  return HeathClient.getBankTransactions(recurringTransaction.bankAccountId, filter, {
    useReadReplica,
  });
}

export async function getBankAccount(
  recurringTransaction: RecurringTransaction,
): Promise<BankAccount> {
  return BankAccount.findByPk(recurringTransaction.bankAccountId);
}

export function updateRSched(
  recurringTransaction: RecurringTransaction,
  rschedArgs: Partial<RSchedArgParams>,
): void {
  recurringTransaction.rsched = new RSched(
    rschedArgs.interval ?? recurringTransaction.rsched.interval,
    rschedArgs.params ?? recurringTransaction.rsched.params,
    rschedArgs.rollDirection ?? recurringTransaction.rsched.rollDirection,
    rschedArgs.dtstart ?? recurringTransaction.rsched.weeklyStart,
  );
}

export function isStale(
  recurringTransaction: RecurringTransaction,
  lastSettled: Moment,
  now: Moment = moment(),
): boolean {
  // Cap at interval duration + 3 days
  const intervalDuration = IntervalDuration[recurringTransaction.rsched.interval];
  if (intervalDuration) {
    return moment()
      .subtract(intervalDuration + 3, 'days')
      .isAfter(lastSettled);
  } else {
    return false;
  }
}
