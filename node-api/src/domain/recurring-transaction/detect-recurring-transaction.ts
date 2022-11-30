import ErrorHelper from '@dave-inc/error-helper';
import { getBankAccountById } from '../../helper/bank-account';
import { MatchResult, RecurringTransactionStatus, TransactionType } from '../../typings';
import { Moment } from 'moment';
import { moment } from '@dave-inc/time-lib';
import {
  PossibleRecurringTransactionResponse,
  RecurringTransactionInterval,
} from '@dave-inc/wire-typings';
import HeathClient from '../../lib/heath-client';
import logger from '../../lib/logger';
import redisClient from '../../lib/redis';
import * as Bluebird from 'bluebird';
import { get, isEmpty, isNil, result as _result, round } from 'lodash';
import { AuditLog, BankAccount, MerchantInfo } from '../../models';
import { getBankTransactionsJSON } from '../../serialization/serialize-recurring-transaction-response';
import { metrics, RecurringTransactionMetrics as Metrics } from './metrics';
import { saveRecurringTransactions } from './';
import { MINIMUM_INCOME_AMOUNT } from './constants';
import * as Create from './create-recurring-transaction';
import { CreateParams, RecurringTransaction } from './types';
import * as Utils from './utils';
import { getControl, runMatchScoreExperiment } from './experiments/match-score-experiment';
import {
  findPossibleRecurringTransactions,
  PossibleRecurringTransactionGroup,
} from './find-possible-recurring-transactions';
import { getByBankAccount } from './store';

export type NewRecurringTransaction = {
  transaction: RecurringTransaction;
  institutionId: number;
  scheduleMatch?: MatchResult;
  minAmount?: number;
};

async function formatResponse(
  possibleRecurringTransactionGroup: PossibleRecurringTransactionGroup,
  bankAccountId: number,
): Promise<PossibleRecurringTransactionResponse> {
  const { transactions: group, scheduleMatch, recurringParams } = possibleRecurringTransactionGroup;

  const category: string = get(group, 'plaidCategory.0', '');
  const subCategory: string = get(group, 'plaidCategory.1', '');
  const merchantInfo: MerchantInfo = await MerchantInfo.getMerchantInfo(
    group.displayName,
    category,
    subCategory,
  );

  const foundSchedule: boolean = !isNil(scheduleMatch);
  let recurringPayload = {};
  if (foundSchedule) {
    const recurring = Create.build(recurringParams);
    recurringPayload = {
      params: recurring.rsched.params,
      rollDirection: recurring.rsched.rollDirection,
      interval: recurring.rsched.interval,
      dtstart: recurring.rsched.weeklyStart.toString(),
      confidence: scheduleMatch.confidence,
      observations: await getBankTransactionsJSON(recurring),
      nextOccurrence: Utils.getNextOccurrence(recurring),
    };
  }

  return {
    ...recurringPayload,
    foundSchedule,
    displayName: group.displayName,
    bankAccountId,
    bankTransactionId: group.transactionId,
    amount: round(group.averageAmount),
    merchantInfo: _result(merchantInfo, 'serialize'),
  };
}

/* API triggered */
export async function detectRecurringTransactions(
  bankAccountId: number,
  type: TransactionType,
  queryDate: Moment = moment(),
): Promise<PossibleRecurringTransactionResponse[]> {
  logger.debug('detecting recurring transactions', { bankAccountId, type });

  const useReplica = false;
  const possibleTransactions = await findPossibleRecurringTransactions(
    bankAccountId,
    type,
    useReplica,
    queryDate,
  );

  const results = await Bluebird.map(possibleTransactions, possible => {
    return formatResponse(possible, bankAccountId);
  });
  results.sort((a, b) => a.displayName.localeCompare(b.displayName));

  logger.debug('detected possible recurring transactions', {
    bankAccountId,
    type,
    count: results.length,
  });

  if (results.length > 0) {
    metrics.increment(Metrics.DETECT_RECURRING_TRANSACTION_SUCCESS, { type });
  } else {
    metrics.increment(Metrics.DETECT_RECURRING_TRANSACTION_FAILURE, { type });
  }

  return results;
}

/**
 * Should only be run if the user has no recurring paycheck
 * transactions.
 */
export async function getSingleTransactionPossibleRecurringIncome(
  bankAccountId: number,
): Promise<PossibleRecurringTransactionResponse[]> {
  const bankAccount = await getBankAccountById(bankAccountId);
  const oneMonthAgo = moment().subtract(1, 'month');

  const bankTransactions = await HeathClient.getBankTransactions(bankAccount.id, {
    amount: { gte: MINIMUM_INCOME_AMOUNT },
    transactionDate: { gte: oneMonthAgo.format('YYYY-MM-DD') },
  });

  const possibleRecurringTransactions: PossibleRecurringTransactionResponse[] = bankTransactions.map(
    bankTransaction => {
      // This information prefills the mobile app for the user, even
      // though the schedule wasn't "found".
      let dayOfMonth = moment(bankTransaction.transactionDate).date();
      if (dayOfMonth > 28) {
        dayOfMonth = -1; // Last day of month.
      }
      return {
        amount: bankTransaction.amount,
        bankAccountId: bankTransaction.bankAccountId,
        bankTransactionId: bankTransaction.id,
        displayName: bankTransaction.displayName,
        foundSchedule: false,
        interval: RecurringTransactionInterval.MONTHLY,
        params: [dayOfMonth],
      };
    },
  );

  return possibleRecurringTransactions;
}

async function saveNewRecurring(
  createdRecurring: NewRecurringTransaction[],
  transactionType: TransactionType,
  matchScoreExperiment: string,
): Promise<RecurringTransaction[]> {
  const stored = saveRecurringTransactions(createdRecurring);
  await Bluebird.map(stored, recurring => {
    const match = createdRecurring.find(
      ({ transaction }) => transaction.transactionDisplayName === recurring.transactionDisplayName,
    )?.scheduleMatch;
    const extra = match
      ? {
          confidence: match.confidence,
          matchScore: match.matchScore,
          percentageOfObserved: match.percentageOfObserved,
          numMatches: match.numMatches,
          numPredictions: match.numPredictions,
          matchScoreExperiment,
        }
      : {};
    return AuditLog.create({
      userId: recurring.userId,
      type: `AUTODETECT-NEW-${transactionType}`,
      successful: true,
      eventUuid: recurring.id,
      message: `Auto-added recurring ${transactionType} ${recurring.id} for user ${recurring.userId}`,
      extra,
    });
  });
  return stored;
}

async function validateSchedule(
  params: CreateParams,
  useReadReplica: boolean = false,
): Promise<RecurringTransaction> {
  try {
    const result = await Create.buildAndValidate(params, useReadReplica);
    if (result.status === RecurringTransactionStatus.VALID) {
      return result;
    } else {
      logger.warn('recurring schedule not valid', { params });
    }
  } catch (error) {
    logger.error('error validating recurring schedule', ErrorHelper.logFormat(error));
  }
}

async function getHighConfidenceFilter(userId: number, transactionType: TransactionType) {
  if (transactionType === TransactionType.EXPENSE) {
    return getControl();
  }
  return runMatchScoreExperiment(userId);
}

export async function addUndetectedRecurringTransaction(
  userId: number,
  bankAccount: BankAccount,
  transactionType: TransactionType,
  options: {
    queryDate?: Moment;
    filterInterval?: RecurringTransactionInterval;
    useReadReplica?: boolean;
  } = {},
): Promise<RecurringTransaction[]> {
  const { queryDate = moment(), filterInterval = null, useReadReplica = false } = options;
  logger.debug(`looking for new recurring transaction`, {
    userId,
    bankAccountId: bankAccount.id,
    transactionType,
  });

  const possibleTransactions = await findPossibleRecurringTransactions(
    bankAccount.id,
    transactionType,
    useReadReplica,
    queryDate,
  );

  const experimentResult = await getHighConfidenceFilter(userId, transactionType);
  const highConfidenceFilter = experimentResult.filter;

  const isHighConfidence = (possible: PossibleRecurringTransactionGroup) => {
    const scheduleMatch = possible.scheduleMatch;
    return !isNil(scheduleMatch) && highConfidenceFilter(scheduleMatch);
  };

  const existingRecurring = await getByBankAccount(bankAccount.id, {
    includeDeleted: true,
    useReadReplica,
  });
  const doesNotAlreadyExist = (possible: PossibleRecurringTransactionGroup) => {
    return !existingRecurring.find(
      x => x.transactionDisplayName === possible.transactions.displayName,
    );
  };

  const matchesIntervalFilter = (possible: PossibleRecurringTransactionGroup) => {
    if (filterInterval) {
      return !isNil(possible.scheduleMatch) && possible.scheduleMatch.interval === filterInterval;
    }
    return true;
  };

  const validated: Array<Promise<NewRecurringTransaction>> = possibleTransactions
    .filter(doesNotAlreadyExist)
    .filter(isHighConfidence)
    .filter(matchesIntervalFilter)
    .map(async possible => {
      const createParams = { ...possible.recurringParams, userId };
      return {
        transaction: await validateSchedule(createParams, useReadReplica),
        scheduleMatch: possible.scheduleMatch,
        minAmount: possible.transactions.minAmount,
        institutionId: bankAccount.institutionId,
      };
    });

  const newRecurring = await Bluebird.all(validated).filter(created => !isNil(created.transaction));
  const savedRecurring = await saveNewRecurring(
    newRecurring,
    transactionType,
    experimentResult.experimentCase,
  );

  if (!isEmpty(savedRecurring)) {
    logger.info(`found new recurring transaction for user`, {
      userId,
      bankAccountId: bankAccount.id,
      transactionType,
      newRecurring: savedRecurring.map(recurring => recurring.id),
    });
  }

  return savedRecurring;
}

const InitialDetectionTTLSec = 60 * 60 * 6; // 6 hours

function initialIncomeDetectionKey(bankAccountId: number): string {
  return `initialIncomeDetection:${bankAccountId}`;
}

export async function setInitialIncomeDetectionRequired(bankAccountId: number): Promise<void> {
  // mark initial detection as active to indicate it has
  // yet to be done
  const key = initialIncomeDetectionKey(bankAccountId);
  await redisClient.setexAsync(key, InitialDetectionTTLSec, '1');
}

export async function markInitialIncomeDetectionComplete(bankAccountId: number): Promise<void> {
  const key = initialIncomeDetectionKey(bankAccountId);
  await redisClient.setexAsync(key, InitialDetectionTTLSec, '0');
}

export async function isInitialIncomeDetectionActive(
  bankAccountId: number,
  bankAccountCreated: Moment,
): Promise<boolean> {
  if (
    moment()
      .subtract(InitialDetectionTTLSec, 'second')
      .isBefore(bankAccountCreated)
  ) {
    // we keep status in Redis for 6 hours. At this point, no status
    // means we haven't ran detection yet
    const key = initialIncomeDetectionKey(bankAccountId);
    const status = await redisClient.getAsync(key);
    return isNil(status) || status === '1';
  } else {
    return false;
  }
}
