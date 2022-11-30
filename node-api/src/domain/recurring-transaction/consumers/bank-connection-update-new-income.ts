import '0-dd-trace-init-first-datadog-enabled';
import { moment } from '@dave-inc/time-lib';
import { Message } from '@google-cloud/pubsub';
import { RetriableError } from '@dave-inc/pubsub';
import { isTestEnv } from '../../../lib/utils';
import * as config from 'config';
import { flatten, isEmpty, once, groupBy, maxBy, isNil } from 'lodash';
import * as Bluebird from 'bluebird';
import { subscribe } from '../../../consumers/utils';
import logger from '../../../lib/logger';
import { RateLimiter } from '../../../lib/rate-limiter';
import {
  BankConnectionUpdateType,
  EventSubscriber,
  IBankConnectionUpdateCompletedEventData,
  RecurringTransactionStatus,
  TransactionType,
} from '../../../typings';
import { BankAccount } from '../../../models';
import { bankConnectionUpdateCompletedEvent } from '../../event';
import {
  TaskTooEarlyError,
  getReadReplicaLag,
  shouldUseReadReplica,
} from '../../../helper/read-replica';
import {
  addUndetectedRecurringTransaction,
  markInitialIncomeDetectionComplete,
} from '../detect-recurring-transaction';
import * as Store from '../store';
import { metrics, RecurringTransactionMetrics as Metrics } from '../metrics';
import Notifications from '../notifications';
import { ModificationSource, RecurringTransaction } from '../types';

async function accountHasIncome(
  bankAccountId: number,
  useReadReplica: boolean = false,
): Promise<boolean> {
  const recurringIncomes = await Store.getByBankAccount(bankAccountId, {
    type: TransactionType.INCOME,
    status: RecurringTransactionStatus.VALID,
    useReadReplica,
  });
  return !isEmpty(recurringIncomes);
}

export async function getAccountsWithoutIncome(
  bankConnectionId: number,
  useReadReplica: boolean = false,
): Promise<number[]> {
  // bank accounts are provided, but need separate fetch to determine what is supported
  return Bluebird.resolve(BankAccount.getSupportedAccountsByBankConnectionId(bankConnectionId))
    .map(bankAccount => bankAccount.id)
    .filter(async bankAccountId => !(await accountHasIncome(bankAccountId, useReadReplica)));
}

// tslint:disable-next-line:only-arrow-functions
const getRateLimiter = once(function() {
  const RateLimitCacheKey = 'recurring_transaction.detect_income.limit';
  const ttlSeconds = config.get<number>('recurringTransaction.autoDetectNewIncomeTTL');

  return new RateLimiter(RateLimitCacheKey, [
    {
      interval: ttlSeconds,
      limit: 1,
    },
  ]);
});

function taskUniqueKey(userId: number, bankConnectionId: number): string {
  return `${userId}-${bankConnectionId}`;
}

function shouldProcessData(updateType: BankConnectionUpdateType): boolean {
  const shouldCheckForIncome =
    updateType === BankConnectionUpdateType.DEFAULT_UPDATE ||
    updateType === BankConnectionUpdateType.INITIAL_UPDATE ||
    updateType === BankConnectionUpdateType.HISTORICAL_UPDATE;
  return shouldCheckForIncome;
}

export async function isRateLimited(userId: number, bankConnectionId: number): Promise<boolean> {
  const key = taskUniqueKey(userId, bankConnectionId);
  return await getRateLimiter().checkLimit(key);
}

async function incrementRateLimiter(userId: number, bankConnectionId: number): Promise<void> {
  // isRateLimited() under the hood increments
  await getRateLimiter().isRateLimited(taskUniqueKey(userId, bankConnectionId));
}

const metricTags = {
  source: EventSubscriber.BankConnectionUpdatedNewIncome,
};

export async function connectionUpdatedDetectIncome(
  userId: number,
  bankConnectionId: number,
  bankAccountIds: number[],
  useReadReplica: boolean = false,
): Promise<RecurringTransaction[]> {
  if (await isRateLimited(userId, bankConnectionId)) {
    metrics.increment(Metrics.NEW_INCOME_DETECTION_RATE_LIMTIED, metricTags);
    return [];
  }

  metrics.increment(Metrics.NEW_INCOME_DETECTION_ATTEMPT, metricTags);

  logger.debug('Detecting new income for user after bank connection update', {
    userId,
    bankAccountIds,
  });

  const autoDetectedIncomes = await runAutoDetection(userId, bankAccountIds, useReadReplica);
  const newIncomes = autoDetectedIncomes ?? [];

  try {
    await setMainPaychecks(newIncomes);
  } catch (error) {
    logger.error('Error setting main account paychecks', {
      error,
      incomeIds: newIncomes.map(i => i.id),
    });
  }

  await incrementRateLimiter(userId, bankConnectionId);
  metrics.increment(Metrics.NEW_INCOME_DETECTION_SUCCESS, metricTags);
  return newIncomes;
}

export async function setMainPaychecks(incomes: RecurringTransaction[]): Promise<BankAccount[]> {
  if (isEmpty(incomes)) {
    return;
  }

  const incomesByAccount = groupBy(incomes, 'bankAccountId');
  const accountIds = incomes.map(i => i.bankAccountId);

  const accountsWithoutMainPaycheck = await BankAccount.findAll({
    where: {
      id: accountIds,
      mainPaycheckRecurringTransactionId: null,
      mainPaycheckRecurringTransactionUuid: null,
    },
  });

  return Bluebird.map(accountsWithoutMainPaycheck, account => {
    const paycheck = maxBy(incomesByAccount[account.id], rt => rt.userAmount);
    if (isNil(paycheck)) {
      return;
    }
    metrics.increment(Metrics.SET_MAIN_PAYCHECK);
    logger.info('Setting main paycheck for bank account', {
      bankAccountId: account.id,
      recurringTransactionId: paycheck.id,
      extRecurringTransactionId: paycheck.groundhogId,
    });
    return account.update({
      mainPaycheckRecurringTransactionId: paycheck.groundhogId ? null : paycheck.id,
      mainPaycheckRecurringTransactionUuid: paycheck.groundhogId ? paycheck.groundhogId : null,
    });
  });
}

async function runAutoDetection(
  userId: number,
  bankAccountIds: number[],
  useReadReplica: boolean = false,
): Promise<RecurringTransaction[]> {
  const results = await Bluebird.map(
    await BankAccount.findAll({ where: { id: bankAccountIds } }),
    bankAccount => {
      return addUndetectedRecurringTransaction(userId, bankAccount, TransactionType.INCOME, {
        useReadReplica,
      });
    },
  );

  const newIncomes = flatten(results);

  if (!isEmpty(newIncomes)) {
    metrics.increment(Metrics.NEW_INCOME_DETECTION_COUNT, newIncomes.length, metricTags);
    newIncomes.forEach(income => Notifications.notifyNewIncome(income, ModificationSource.System));
  }

  return newIncomes;
}

const AutodetectIncomeMaxLag = 60 * 60 * 12;

// We don't want to use the read replica or defer this task for new users
const NondeferrableUpdateTypes = new Set([
  BankConnectionUpdateType.INITIAL_UPDATE,
  BankConnectionUpdateType.HISTORICAL_UPDATE,
]);

export async function onProcessData(data: IBankConnectionUpdateCompletedEventData, event: Message) {
  try {
    const bankAccountIds = await getAccountsWithoutIncome(data.bankConnectionId);
    if (shouldProcessData(data.updateType) && !isEmpty(bankAccountIds)) {
      const publishTime = event.publishTime.toStruct().seconds;
      const messageLag = moment().diff(publishTime * 1000, 'seconds');
      const useReadReplica =
        !NondeferrableUpdateTypes.has(data.updateType) &&
        (await shouldUseReadReplica(await getReadReplicaLag(), messageLag, AutodetectIncomeMaxLag));

      await connectionUpdatedDetectIncome(
        data.userId,
        data.bankConnectionId,
        bankAccountIds,
        useReadReplica,
      );

      if (data.updateType === BankConnectionUpdateType.INITIAL_UPDATE) {
        await Promise.all(bankAccountIds.map(markInitialIncomeDetectionComplete));
      }
    }
  } catch (error) {
    if (error instanceof TaskTooEarlyError) {
      logger.warn('Deferring detect new income task', {
        error,
        userId: data.userId,
        bankConnectionId: data.bankConnectionId,
        updateType: data.updateType,
      });
      metrics.increment(Metrics.NEW_INCOME_DETECTION_DEFERRED, metricTags);
      // rethrow to make pubsub client nack
      throw new RetriableError(error, {
        ...(error.data as object),
        userId: data.userId,
        bankConnectionId: data.bankConnectionId,
        eventId: event.id,
      });
    } else {
      logger.error('Error detecting new income for user after bank connection update', { error });
      metrics.increment(Metrics.NEW_INCOME_DETECTION_ERROR, metricTags);
    }
  }
}

if (!isTestEnv()) {
  const autoDetectIsEnabledConfig = config.get<boolean | string>(
    'recurringTransaction.autoDetectNewIncome',
  );
  const autoDetectIsEnabled =
    typeof autoDetectIsEnabledConfig === 'string'
      ? autoDetectIsEnabledConfig === 'TRUE'
      : autoDetectIsEnabledConfig;

  const subscriptionName = EventSubscriber.BankConnectionUpdatedNewIncome;
  if (autoDetectIsEnabled) {
    subscribe<IBankConnectionUpdateCompletedEventData>({
      topic: bankConnectionUpdateCompletedEvent,
      subscriptionName,
      onProcessData,
    });
  } else {
    logger.warn(`Consumer ${subscriptionName} disabled by config flag`);
  }
}
