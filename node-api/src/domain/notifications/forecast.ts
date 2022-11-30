import { Op } from 'sequelize';

import { ForecastJsonResponse } from '@dave-inc/wire-typings';

import { BankAccount, BankTransaction, Institution, User } from '../../models';
import {
  AnalyticsEvent,
  AnalyticsUserProperty,
  BrazeProperties,
  ForecastEventInput,
} from '../../typings';

import { createMarketingEventsForUser } from './marketing-event';
import { metrics, NotificationMetrics } from './metrics';

export async function sendForecastAlerts(
  newForecast: ForecastJsonResponse,
  lastForecast?: ForecastJsonResponse,
) {
  const bankAccount = await BankAccount.findByPk(newForecast.bankAccountId);
  if (!lastForecast) {
    return false;
  }

  const user = await User.findByPk(newForecast.userId);
  if (!user) {
    return false;
  }
  const lowBalanceThreshold = user.settings.low_balance_alert || null;

  const institution = await Institution.findByPk(bankAccount.institutionId);
  let balanceAfterPending = newForecast.startBalance;
  if (!institution.balanceIncludesPending) {
    balanceAfterPending = newForecast.pending.reduce((acc, transaction) => {
      if (transaction.amount < 0) {
        return acc + transaction.amount;
      } else {
        return acc;
      }
    }, newForecast.startBalance);
  }

  return await buildAndSendForecastEvent({
    userId: bankAccount.userId,
    bankAccountId: bankAccount.id,
    bankName: institution.displayName,
    balanceAfterPending,
    newForecast,
    lastForecast,
    lowBalanceThreshold,
  });
}

export async function buildAndSendForecastEvent(eventInput: ForecastEventInput): Promise<boolean> {
  const {
    userId,
    bankAccountId,
    bankName,
    balanceAfterPending,
    lowBalanceThreshold,
    newForecast,
    lastForecast,
  } = eventInput;

  let eventName: AnalyticsEvent;
  let finalProperties: BrazeProperties;

  const baseProperties: BrazeProperties = {
    [AnalyticsUserProperty.UserId]: userId,
    [AnalyticsUserProperty.AccountId]: bankAccountId,
    [AnalyticsUserProperty.AvailableBalance]: newForecast.startBalance,
    [AnalyticsUserProperty.BankName]: bankName,
  };

  if (newForecast.startBalance < 0 && lastForecast.startBalance > 0) {
    eventName = AnalyticsEvent.BankAccountOverdrawn;
    finalProperties = await buildBankAccountOverdrawnProperties(baseProperties, eventInput);
  } else if (balanceAfterPending < 0 && lastForecast.lowestBalance > 0) {
    eventName = AnalyticsEvent.BankAccountOverdraftPending;
    finalProperties = await buildPendingOverDraftProperties(baseProperties, eventInput);
  } else if (newForecast.lowestBalance < 0 && lastForecast.lowestBalance > 0) {
    eventName = AnalyticsEvent.PotentialOverdraftIdentified;
    finalProperties = await buildPotentialOverdraftProperties(baseProperties, eventInput);
  } else if (
    lowBalanceThreshold &&
    newForecast.startBalance < lowBalanceThreshold &&
    lastForecast.startBalance > lowBalanceThreshold
  ) {
    eventName = AnalyticsEvent.SafetyNetBreached;
    finalProperties = await buildSafetyNetBreachedProperties(baseProperties, eventInput);
  }

  if (eventName && finalProperties) {
    await createMarketingEventsForUser(`${userId}`, eventName, finalProperties);
    return true;
  }

  metrics.increment(NotificationMetrics.EVENT_NOT_CREATED);

  return false;
}

async function buildBankAccountOverdrawnProperties(
  baseProperties: BrazeProperties,
  { bankAccountId }: ForecastEventInput,
): Promise<BrazeProperties> {
  const properties: BrazeProperties = { ...baseProperties };

  const lastCompletedExpense = await findLastBankTransaction({ bankAccountId, pending: false });

  if (lastCompletedExpense) {
    const { amount, merchantInfo } = lastCompletedExpense;

    properties[AnalyticsUserProperty.LastTransactionAmount] = amount;
    properties[AnalyticsUserProperty.LastTransactionMerchantName] = merchantInfo
      ? merchantInfo.displayName
      : '';
  }

  return properties;
}

async function buildPotentialOverdraftProperties(
  baseProperties: BrazeProperties,
  { bankAccountId, newForecast }: ForecastEventInput,
): Promise<BrazeProperties> {
  const properties: BrazeProperties = {
    ...baseProperties,
    [AnalyticsUserProperty.ForecastBalance]: newForecast.lowestBalance,
  };

  const lastPendingExpense = await findLastBankTransaction({ bankAccountId, pending: true });

  if (lastPendingExpense) {
    const { amount, merchantInfo } = lastPendingExpense;

    properties[AnalyticsUserProperty.LastPendingTransactionAmount] = amount;
    properties[AnalyticsUserProperty.LastPendingTransactionMerchantName] = merchantInfo
      ? merchantInfo.displayName
      : '';
  }

  const lastCompletedExpense = await findLastBankTransaction({ bankAccountId, pending: false });

  if (lastCompletedExpense) {
    const { amount: completedAmount, merchantInfo: completedMerchantInfo } = lastCompletedExpense;

    properties[AnalyticsUserProperty.LastTransactionAmount] = completedAmount;
    properties[AnalyticsUserProperty.LastTransactionMerchantName] = completedMerchantInfo
      ? completedMerchantInfo.displayName
      : '';
  }

  return properties;
}

async function buildPendingOverDraftProperties(
  baseProperties: BrazeProperties,
  { bankAccountId }: ForecastEventInput,
): Promise<BrazeProperties> {
  const properties: BrazeProperties = {
    ...baseProperties,
  };

  const lastPendingExpense = await findLastBankTransaction({ bankAccountId, pending: true });

  if (lastPendingExpense) {
    const { amount, merchantInfo } = lastPendingExpense;

    properties[AnalyticsUserProperty.LastPendingTransactionAmount] = amount;
    properties[AnalyticsUserProperty.LastPendingTransactionMerchantName] = merchantInfo
      ? merchantInfo.displayName
      : '';
  }

  return properties;
}

async function buildSafetyNetBreachedProperties(
  baseProperties: BrazeProperties,
  { bankAccountId, newForecast, lowBalanceThreshold }: ForecastEventInput,
): Promise<BrazeProperties> {
  const properties: BrazeProperties = {
    ...baseProperties,
    [AnalyticsUserProperty.ForecastBalance]: newForecast.lowestBalance,
    [AnalyticsUserProperty.SafetyNetAmount]: lowBalanceThreshold,
    [AnalyticsUserProperty.LowestBalanceUntilPayday]: newForecast.lowestBalance,
  };

  const lastCompletedExpense = await findLastBankTransaction({ bankAccountId, pending: false });

  if (lastCompletedExpense) {
    const { amount, merchantInfo } = lastCompletedExpense;

    properties[AnalyticsUserProperty.LastTransactionAmount] = amount;
    properties[AnalyticsUserProperty.LastTransactionMerchantName] = merchantInfo
      ? merchantInfo.displayName
      : '';
  }

  return properties;
}

async function findLastBankTransaction({
  bankAccountId,
  pending = false,
}: {
  bankAccountId: number;
  pending?: boolean;
}): Promise<BankTransaction> {
  return BankTransaction.findOne({
    where: {
      amount: {
        [Op.lt]: 0,
      },
      pending,
      bankAccountId,
    },
    include: [{ association: 'merchantInfo' }],
    order: [['id', 'DESC']],
  });
}
