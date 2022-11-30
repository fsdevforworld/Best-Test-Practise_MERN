import { MatchResult, TransactionType } from '../../typings';
import { CreateParams } from './types';
import { isLoanDeposit } from './validate-recurring-transaction';
import { DateOnly, moment, Moment } from '@dave-inc/time-lib';
import * as Bluebird from 'bluebird';
import { get, isNil } from 'lodash';
import { sequelize } from '../../models';
import { QueryTypes } from 'sequelize';
import { MINIMUM_INCOME_AMOUNT, MINIMUM_SINGLE_TRANSACTION_INCOME_AMOUNT } from './constants';
import { getBestScheduleMatch } from './detect-recurring-schedule';

type TransactionGroup = {
  displayName: string;
  dates: string;
  cnt: number;
  maxDate: Moment;
  transactionId: number;
  averageAmount: number;
  minAmount: number;
  plaidCategory: string[];
};

export type PossibleRecurringTransactionGroup = {
  transactions: TransactionGroup;
  scheduleMatch?: MatchResult;
  recurringParams?: CreateParams;
};

export type SingleTransactionIncome = {
  transactionId: number;
  displayName: string;
  transactionDate: Moment;
  amount: number;
  plaidCategory: string[];
};

/**
 * Find groups of transactions that could be a part of a
 * regularly re-occurring sequence of transactions.
 *
 * @return the group of transactions, a possible recurring
 *         schedule, and a confidence for that schedule
 */
export async function findPossibleRecurringTransactions(
  bankAccountId: number,
  type: TransactionType,
  useReadReplica: boolean = false,
  queryDate: Moment = moment(),
): Promise<PossibleRecurringTransactionGroup[]> {
  const groupedTransactions = await getTransactionsGroupedByName(
    bankAccountId,
    type,
    useReadReplica,
    queryDate,
  );

  const isValidGroup = (group: TransactionGroup) => isValidRecurringGroup(group, type);

  const possibleTransactions = Bluebird.resolve(groupedTransactions)
    .filter(isValidGroup)
    .map(group => buildPossibleRecurringGroup(group, bankAccountId, queryDate))
    .filter(possible => !isNil(possible.scheduleMatch));
  return possibleTransactions;
}

async function getTransactionsGroupedByName(
  bankAccountId: number,
  type: TransactionType,
  useReadReplica: boolean = false,
  queryDate: Moment = moment(),
): Promise<TransactionGroup[]> {
  const replacements: any = {
    bankAccountId,
    currentDate: queryDate.format('YYYY-MM-DD'),
    latestTransactionSearchPeriod: 40,
  };

  const transactionGroup = await sequelize.query<TransactionGroup>(
    `
      SELECT
        groups.*, plaid_category as plaidCategory
        FROM
        (
          SELECT
            display_name as displayName,
            COUNT(*) as cnt,
            MAX(transaction_date) as maxDate,
            MAX(id) as transactionId,
            AVG(amount) as averageAmount,
            MIN(amount) as minAmount,
            GROUP_CONCAT(transaction_date ORDER BY transaction_date DESC) as dates
          FROM bank_transaction
          WHERE bank_account_id = :bankAccountId
            AND amount ${type === TransactionType.INCOME ? `> ${MINIMUM_INCOME_AMOUNT}` : '< 0'}
          GROUP BY display_name having COUNT(*) > 1
          ORDER BY cnt DESC
        ) groups
        JOIN (SELECT id, plaid_category FROM bank_transaction) bankTransaction
        ON bankTransaction.id = groups.transactionId
        WHERE groups.maxDate > DATE(:currentDate) - INTERVAL :latestTransactionSearchPeriod DAY
    `,
    {
      replacements,
      type: QueryTypes.SELECT,
      useMaster: !useReadReplica,
    },
  );
  return transactionGroup;
}

function isValidRecurringGroup(group: TransactionGroup, type: TransactionType): boolean {
  const category: string = get(group, 'plaidCategory.0', '');
  const subCategory: string = get(group, 'plaidCategory.1', '');
  if (type === TransactionType.EXPENSE) {
    return isValidExpenseCategory(category, subCategory);
  }

  return (
    isValidIncomeCategory(category, subCategory) &&
    !isLoanDeposit(group.displayName, group.averageAmount)
  );
}

function isValidIncomeCategory(category: string, subCategory: string): boolean {
  return true;
}

const INVALID_EXPENSE_CATEGORIES: string[] = ['Shops', 'Travel'];
const INVALID_EXPENSE_SUBCATEGORIES: { [category: string]: string[] } = {
  'Bank Fees': ['Insufficient Funds'],
  'Food and Drink': ['Restaurants'],
};

function isValidExpenseCategory(category: string, subCategory: string): boolean {
  if (INVALID_EXPENSE_CATEGORIES.includes(category)) {
    return false;
  }

  if (
    category in INVALID_EXPENSE_SUBCATEGORIES &&
    INVALID_EXPENSE_SUBCATEGORIES[category].includes(subCategory)
  ) {
    return false;
  }

  return true;
}

async function buildPossibleRecurringGroup(
  group: TransactionGroup,
  bankAccountId: number,
  queryDate: Moment,
): Promise<PossibleRecurringTransactionGroup> {
  const scheduleMatch = matchGroupSchedule(group, queryDate);
  if (scheduleMatch) {
    const recurringParams = recurringTransactionParams(group, scheduleMatch, bankAccountId);
    return {
      transactions: group,
      scheduleMatch,
      recurringParams,
    };
  } else {
    return { transactions: group };
  }
}

function matchGroupSchedule(group: TransactionGroup, queryDate: Moment): MatchResult {
  const dates = group.dates.split(',').map((date: string) => moment(date));
  const match = getBestScheduleMatch(dates, { today: DateOnly.fromMoment(queryDate) });
  return match;
}

function recurringTransactionParams(
  group: TransactionGroup,
  match: MatchResult,
  bankAccountId: number,
) {
  return {
    bankAccountId,
    dtstart: match.weeklyStart,
    interval: match.interval,
    params: match.params,
    rollDirection: match.rollDirection,
    userDisplayName: group.displayName,
    transactionDisplayName: group.displayName,
    userAmount: group.averageAmount,
  };
}

export async function findSingleIncomeTransactions(
  bankAccountId: number,
  queryDate: Moment = moment(),
): Promise<SingleTransactionIncome[]> {
  const replacements: any = {
    bankAccountId,
    currentDate: queryDate.format('YYYY-MM-DD'),
    minimumIncomeAmount: MINIMUM_SINGLE_TRANSACTION_INCOME_AMOUNT,
    latestTransactionSearchPeriod: 40,
  };

  const singleTransactionIncomes = await sequelize.query<SingleTransactionIncome>(
    `
      SELECT
        groups.*, plaid_category as plaidCategory
        FROM
        (
          SELECT
            display_name as displayName,
            ANY_VALUE(transaction_date) as transactionDate,
            ANY_VALUE(id) as transactionId,
            ANY_VALUE(amount) as amount
          FROM bank_transaction
          WHERE bank_account_id = :bankAccountId
            AND amount > :minimumIncomeAmount
          GROUP BY display_name having COUNT(*) = 1
        ) groups
        JOIN (SELECT id, plaid_category FROM bank_transaction) bankTransaction
        ON bankTransaction.id = groups.transactionId
        WHERE groups.transactionDate > DATE(:currentDate) - INTERVAL :latestTransactionSearchPeriod DAY
    `,
    {
      replacements,
      type: QueryTypes.SELECT,
    },
  );
  return singleTransactionIncomes;
}
