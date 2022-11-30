import * as config from 'config';
import { buildExperiment } from '@dave-inc/experiment';
import { isEmpty, flatten, min } from 'lodash';
import * as Bluebird from 'bluebird';

import logger from '../../../lib/logger';
import { buildLimiter } from '../../../lib/experiment-limiter';
import { publishNewRecurringTransaction } from '../events';
import {
  matchPreviousAccountIncome,
  MatchPreviousAccountIncomeResult,
  doIncomeTransition,
} from '../match-previous-account-income';
import { BankAccount, ABTestingEvent } from '../../../models';
import { RecurringTransaction } from '../types';
import { metrics, RecurringTransactionMetrics as Metrics } from '../metrics';

export const TRANSITION_INCOME_EXPERIMENT = 'match-account-transition-income';
const TRANSITION_INCOME_EXPERIMENT_LIMIT = config.get<number>(
  `experiments.${TRANSITION_INCOME_EXPERIMENT}.limit`,
);

export async function runTransitionIncomeExperiment(
  userId: number,
  bankAccounts: BankAccount[],
): Promise<RecurringTransaction[]> {
  try {
    return _runTransitionIncomeExperiment(userId, bankAccounts);
  } catch (error) {
    logger.error('Error running transition income experiment', { error, userId });
    return [];
  }
}

async function _runTransitionIncomeExperiment(
  userId: number,
  bankAccounts: BankAccount[],
): Promise<RecurringTransaction[]> {
  const results = await detectTransitionedIncomes(userId, bankAccounts);

  metrics.increment(Metrics.MATCH_PREVIOUS_ACCOUNT_INCOME_COUNT, results.length);

  if (isEmpty(results)) {
    return [];
  }

  const detectionResultMetadata = results.map(({ oldIncome, toBankAccount }) => {
    return {
      recurringTransactionId: oldIncome.id,
      bankAccountId: oldIncome.bankAccountId,
      toBankAccountId: toBankAccount.id,
    };
  });
  const bankAccountIds = bankAccounts.map(a => a.id);

  logger.info('Detected transitioned incomes', {
    userId,
    bankAccountIds,
    results: detectionResultMetadata,
  });

  const experiment = buildExperiment(TRANSITION_INCOME_EXPERIMENT, {
    experiment: async () => {
      const newIncomes = await saveTransitionedIncomes(results);

      metrics.increment(Metrics.SAVE_PREVIOUS_ACCOUNT_INCOME_COUNT, newIncomes.length);

      const extra = {
        bankAccountIds,
        oldIncomes: detectionResultMetadata,
        newIncomes: newIncomes.map(i => {
          return {
            id: i.id,
            bankAccountId: i.bankAccountId,
          };
        }),
      };

      logger.info('Saved transitioned incomes', {
        userId,
        ...extra,
      });

      await ABTestingEvent.create({
        userId,
        eventName: `${TRANSITION_INCOME_EXPERIMENT}_bucketed`,
        eventUuid: userId,
        extra,
      });

      return newIncomes;
    },
    control: async () => {
      await ABTestingEvent.create({
        userId,
        eventName: `${TRANSITION_INCOME_EXPERIMENT}_not-bucketed`,
        eventUuid: userId,
        extra: {
          bankAccountIds,
          oldIncomes: detectionResultMetadata,
        },
      });
      return [] as RecurringTransaction[];
    },
    limiter: buildLimiter(TRANSITION_INCOME_EXPERIMENT, TRANSITION_INCOME_EXPERIMENT_LIMIT),
    incrementBy: (detectedIncomes: RecurringTransaction[]) => {
      return detectedIncomes.length;
    },
  });

  return experiment(userId);
}

async function saveTransitionedIncomes(
  matchResults: MatchPreviousAccountIncomeResult[],
): Promise<RecurringTransaction[]> {
  return Bluebird.map(matchResults, async result => {
    const newIncome = await doIncomeTransition(result);
    const amounts = result.matchedTransactions.map(
      ([_expected, bankTransaction]) => bankTransaction.amount,
    );

    publishNewRecurringTransaction({
      transaction: newIncome,
      institutionId: result.toBankAccount.institutionId,
      minAmount: min(amounts),
    });

    return newIncome;
  });
}

async function detectTransitionedIncomes(
  userId: number,
  bankAccounts: BankAccount[],
): Promise<MatchPreviousAccountIncomeResult[]> {
  logger.info('Detecting transitioned income for user after bank connection update', {
    userId,
    bankAccountIds: bankAccounts.map(a => a.id),
  });

  const results = await Bluebird.map(bankAccounts, matchPreviousAccountIncome);

  return flatten(results);
}
