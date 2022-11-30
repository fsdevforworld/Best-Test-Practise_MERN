import '0-dd-trace-init-first-datadog-enabled';
import ErrorHelper from '@dave-inc/error-helper';
import { RecurringTransactionInterval } from '@dave-inc/wire-typings';
import { isTestEnv } from '../../../lib/utils';
import * as config from 'config';
import { flatten } from 'lodash';
import * as Bluebird from 'bluebird';
import logger from '../../../lib/logger';
import {
  BankConnectionUpdateType,
  EventSubscriber,
  IBankConnectionUpdateCompletedEventData,
  TransactionType,
} from '../../../typings';
import { BankAccount } from '../../../models';
import { isBucketed } from '../../../experiments/auto-add-expenses-experiment';
import { subscribe } from '../../../consumers/utils';

import { bankConnectionUpdateCompletedEvent } from '../../event';
import { addUndetectedRecurringTransaction } from '../detect-recurring-transaction';
import { metrics, RecurringTransactionMetrics as Metrics } from '../metrics';
import Notifications from '../notifications';
import { ModificationSource, RecurringTransaction } from '../types';
import * as AutoExpenseUdpateRateLimiter from '../auto-update-expense-rate-limiter';

const metricTags = { source: EventSubscriber.BankConnectionUpdatedNewExpenses };
const infoMessage = 'Detecting new expenses for user after bank connection update';

export async function onProcessData(data: IBankConnectionUpdateCompletedEventData): Promise<void> {
  const shouldProcess = await shouldProcessData(data);
  if (!shouldProcess) {
    return;
  }

  metrics.increment(Metrics.NEW_EXPENSE_DETECTION_ATTEMPT, metricTags);
  try {
    const recurring = await addNewExpenses(data);
    await sendNotifications(data.userId, recurring);
    metrics.increment(Metrics.NEW_EXPENSE_DETECTION_SUCCESS, metricTags);
    await AutoExpenseUdpateRateLimiter.setLimited(data.userId, data.bankConnectionId);
  } catch (error) {
    logger.error(`${infoMessage} - failed`, ErrorHelper.logFormat(error));
    metrics.increment(Metrics.NEW_EXPENSE_DETECTION_ERROR, metricTags);
  }
  logger.debug(`${infoMessage} - complete`);
}

async function shouldProcessData(data: IBankConnectionUpdateCompletedEventData): Promise<boolean> {
  const shouldProcessDataByUpdateType =
    data.updateType === BankConnectionUpdateType.DEFAULT_UPDATE ||
    data.updateType === BankConnectionUpdateType.HISTORICAL_UPDATE;
  if (!shouldProcessDataByUpdateType) {
    return false;
  }

  logger.debug(`${infoMessage} - start`, { userId: data.userId });
  if (!isBucketed(data.userId)) {
    logger.debug(`${infoMessage} - exiting: not bucketed into experiment`, { userId: data.userId });
    return false;
  }

  const rateLimited = await AutoExpenseUdpateRateLimiter.getLimited(
    data.userId,
    data.bankConnectionId,
  );
  if (rateLimited) {
    metrics.increment(Metrics.NEW_EXPENSE_DETECTION_RATE_LIMITED, metricTags);
    return false;
  }
  return true;
}

async function addNewExpenses(
  data: IBankConnectionUpdateCompletedEventData,
): Promise<RecurringTransaction[]> {
  const results = await Bluebird.map(
    BankAccount.getSupportedAccountsByBankConnectionId(data.bankConnectionId),
    bankAccount =>
      addUndetectedRecurringTransaction(data.userId, bankAccount, TransactionType.EXPENSE, {
        filterInterval: RecurringTransactionInterval.MONTHLY,
        useReadReplica: true,
      }),
  );
  return flatten(results);
}

export async function sendNotifications(userId: number, recurring: RecurringTransaction[]) {
  const count = recurring.length;
  const addedBy = ModificationSource.System;
  const location = 'auto add';
  await Notifications.notifyExpensesPredicted(userId, count, addedBy, location);
  recurring.forEach(txn => Notifications.notifyAddExpense(txn, addedBy, location));
  metrics.increment(Metrics.NEW_EXPENSE_DETECTION_COUNT, count, metricTags);
}

if (!isTestEnv()) {
  const subscriptionName = EventSubscriber.BankConnectionUpdatedNewExpenses;
  const autoDetectIsEnabledConfig = config.get<boolean | string>(
    'recurringTransaction.autoDetectNewExpenses',
  );
  const autoDetectIsEnabled =
    typeof autoDetectIsEnabledConfig === 'string'
      ? autoDetectIsEnabledConfig === 'TRUE'
      : autoDetectIsEnabledConfig;

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
