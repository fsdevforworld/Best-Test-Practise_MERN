import { Moment } from 'moment';
import { BankTransaction } from '@dave-inc/heath-client';
import { ExpectedTransaction, RecurringTransaction } from './types';
import * as Utils from './utils';
import { moment } from '@dave-inc/time-lib';
import AdvanceApprovalClient from '../../lib/advance-approval-client';

const nameSplitReg = /(\.|\s|:|,|\/)/;
const tokenFilterReg = /(\.|\s|:|,|\/|from|RCVD|PMNT|direct|dir|dep|deposit|payroll|ref-*|credit|for|ach|electronic|ppd|^(?![\s\S]))/i;
const tokenFilterFunc = (token: string) => !token.match(tokenFilterReg);
const ALLOWABLE_AMOUNT_VARIANCE = 0.05;

interface IScoredBankTransaction {
  transaction: BankTransaction;
  score: number;
  dateDiff: number;
}

type ScoreFn = (bt: BankTransaction) => number;

function scoreTransaction(
  transaction: BankTransaction,
  expectedDate: Moment,
  scoreFn: ScoreFn,
): IScoredBankTransaction {
  return {
    transaction,
    score: scoreFn(transaction),
    dateDiff: Math.abs(moment(transaction.transactionDate).diff(expectedDate)),
  };
}

/**
 * transaction match comparison function. Primarily compare by
 * score, and tie break with date proximity to the expected
 * transaction
 */
function scoredTransactionCmp(a: IScoredBankTransaction, b: IScoredBankTransaction): number {
  if (a.score !== b.score) {
    // higher score sorts earlier
    return b.score - a.score;
  } else {
    // lower time delta sorts earlier
    return a.dateDiff - b.dateDiff;
  }
}

/**
 * Given a scoring criteria (where lower scores are better),
 * score bank transactions by match quality for an expected
 * transaction. Tie breaks scores with time diff vs expected
 * transaction time. Returns a sorted list of bank transactions
 * descending by match quality
 *
 * @param bankTransactions - candidate transactions to match against
 * @param expected - expected transaction to match for
 * @param scoreFn - scoring function for BankTransaction, a higher score
 *                  is considered better
 * @param filterFn - filter predicate for scores. If this evaluates
 *                   to false for a transaction's score, the transaction
 *                   is not eligible for matching
 *                   Defaults to returning true for any transaction
 */
export function scoreBankTransactions(
  bankTransactions: BankTransaction[],
  expected: ExpectedTransaction,
  scoreFn: (bt: BankTransaction) => number,
  filterFn: (score: number) => boolean = _ => true,
): BankTransaction[] {
  return bankTransactions
    .map(t => scoreTransaction(t, expected.expectedDate, scoreFn))
    .filter(scored => filterFn(scored.score))
    .sort(scoredTransactionCmp)
    .map(scored => scored.transaction);
}

/**
 * For an expected transaction and a list of candidate matches,
 * find the best match by name similarity if there is an
 * appropriate one
 */
export function getMatchByName(
  expected: ExpectedTransaction,
  transactions: BankTransaction[],
  matchDisplayName: string,
): BankTransaction {
  const expectedParts = getStringCompareTokens(matchDisplayName);
  const scoreFn = (t: BankTransaction) => getNameSimilarityRatio(t, expectedParts);
  const filterFn = (score: number) => score > 0;
  const [bestMatch] = scoreBankTransactions(transactions, expected, scoreFn, filterFn);
  return bestMatch;
}

function getStringCompareTokens(name: string): string[] {
  return name
    .split(nameSplitReg)
    .filter(tokenFilterFunc)
    .map(a => a.toLowerCase());
}

function getNameSimilarityRatio(
  transaction: BankTransaction,
  expectedTransactionNameParts: string[],
): number {
  const transactionParts = getStringCompareTokens(transaction.displayName);
  const numMatches = expectedTransactionNameParts.filter(
    (part: string) => transactionParts.indexOf(part) >= 0,
  ).length;

  return Math.max(
    numMatches / expectedTransactionNameParts.length,
    numMatches / transactionParts.length,
  );
}

/**
 * For an expected transaction and a list of candidate matches,
 * find the best match by amount if there is an appropriate one
 */
export async function getMatchByAmount(
  expected: ExpectedTransaction,
  recurringTransaction: RecurringTransaction,
  transactions: BankTransaction[],
): Promise<BankTransaction> {
  const [lastFoundTransaction] = await Utils.getMatchingBankTransactions(recurringTransaction);

  const amountToMatch = lastFoundTransaction
    ? lastFoundTransaction.amount
    : expected.expectedAmount;

  if (amountToMatch < AdvanceApprovalClient.MINIMUM_PAYCHECK_AMOUNT) {
    return;
  }

  const scoreFn = (t: BankTransaction) => getAmountMatchScore(t.amount, amountToMatch);
  const filterFn = (score: number) => score > 1.0 - ALLOWABLE_AMOUNT_VARIANCE;
  const [bestMatch] = scoreBankTransactions(transactions, expected, scoreFn, filterFn);
  return bestMatch;
}

function getAmountMatchScore(amount: number, amountToMatch: number): number {
  const amountDiff = Math.abs(amount - amountToMatch);
  const matchPct = 1.0 - amountDiff / amountToMatch;
  return matchPct;
}
