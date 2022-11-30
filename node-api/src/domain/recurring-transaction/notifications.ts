import { isNil, partial } from 'lodash';
import ErrorHelper from '@dave-inc/error-helper';
import braze from '../../lib/braze';
import logger from '../../lib/logger';
import { AnalyticsLocation, ModificationSource, RecurringTransaction } from './types';
import * as Utils from './utils';
import { Institution } from '../../models';
import { moment } from '@dave-inc/time-lib';
import { AnalyticsEvent, RecurringTransactionStatus } from '../../typings';
import { createMarketingAttributesForUser, createMarketingEventsForUser } from '../notifications';
import AdvanceApprovalClient from '../../lib/advance-approval-client';

async function sendTransactionMissed(recurringTransaction: RecurringTransaction): Promise<void> {
  if (!recurringTransaction.missed || recurringTransaction.userAmount <= 0) {
    return;
  }

  await braze
    .track({
      attributes: [
        {
          missed_income_on: recurringTransaction.missed,
          externalId: recurringTransaction.userId.toString(),
          hasRecurringIncome: false,
          lastIncomeUpdated: moment().toISOString(),
        },
      ],
      events: [
        {
          externalId: recurringTransaction.userId.toString(),
          name: AnalyticsEvent.RecurringIncomeMissed,
          time: recurringTransaction.missed,
          properties: {
            amount: recurringTransaction.userAmount,
          },
        },
      ],
    })
    .catch(error => {
      logNotificationError(recurringTransaction, AnalyticsEvent.RecurringIncomeMissed, error);
    });
}

function logNotificationError(
  recurringTransaction: RecurringTransaction,
  event: AnalyticsEvent,
  error: any,
): void {
  logger.error(
    `Failed to send notifications for ${event}`,
    Object.assign(ErrorHelper.logFormat(error), {
      recurringTransactionId: recurringTransaction.id,
      userId: recurringTransaction.userId,
    }),
  );
}

async function notifyNewIncome(
  newRecurringIncome: RecurringTransaction,
  source: ModificationSource,
): Promise<void> {
  if (newRecurringIncome.userAmount < 0) {
    logger.error('notifyNewIncome called on an expense', {
      recurringTransactionId: newRecurringIncome.id,
      amount: newRecurringIncome.userAmount,
    });
    return;
  }

  const bankAccount = await Utils.getBankAccount(newRecurringIncome);
  if (!isNil(bankAccount)) {
    const institution = await Institution.findByPk(bankAccount.institutionId);
    const institutionName = institution?.displayName || '';

    const payload = {
      userId: newRecurringIncome.userId,
      institutionName,
      isValid: newRecurringIncome.status === RecurringTransactionStatus.VALID,
      amount: newRecurringIncome.userAmount,
      displayName: newRecurringIncome.transactionDisplayName,
      addedBy: source,
    };
    createMarketingEventsForUser(
      newRecurringIncome.userId.toString(),
      AnalyticsEvent.RecurringIncomeAdded,
      payload,
    ).catch(
      partial(
        logNotificationError,
        newRecurringIncome,
        AnalyticsEvent.RecurringIncomeStatusChanged,
      ),
    );

    const isDaveSpendingAccount = await bankAccount.isDaveSpendingAccount();
    if (isDaveSpendingAccount && newRecurringIncome.status === RecurringTransactionStatus.VALID) {
      sendBankMarketingEvents(newRecurringIncome);
    }
    const userAttribute = {
      hasRecurringIncome: newRecurringIncome.status === RecurringTransactionStatus.VALID,
      lastIncomeUpdated: moment().toISOString(),
    };
    createMarketingAttributesForUser(newRecurringIncome.userId.toString(), userAttribute).catch(
      partial(
        logNotificationError,
        newRecurringIncome,
        AnalyticsEvent.RecurringIncomeStatusChanged,
      ),
    );
  } else {
    logger.error('No bank account for new recurring transaction', {
      recurringTransactionId: newRecurringIncome.id,
      userId: newRecurringIncome.userId,
    });
  }
}

async function notifyExpensesPredicted(
  userId: number,
  count: number,
  addedBy: ModificationSource,
  location: AnalyticsLocation,
): Promise<void> {
  await createMarketingEventsForUser(userId.toString(), AnalyticsEvent.RecurringExpensesPredicted, {
    count,
    addedBy,
    location,
  });
}

async function notifyAddExpense(
  expense: RecurringTransaction,
  addedBy: ModificationSource,
  location: AnalyticsLocation,
  predicted: boolean = true,
): Promise<void> {
  if (expense.userAmount < 0) {
    const payload = getRecurringExpenseAnalytics(expense);
    await createMarketingEventsForUser(
      expense.userId.toString(),
      AnalyticsEvent.RecurringExpenseAdded,
      { ...payload, addedBy, location, predicted },
    );
  }
}

function getRecurringExpenseAnalytics(expense: RecurringTransaction) {
  return {
    id: expense.id,
    bankAccountId: expense.bankAccountId,
    amount: expense.userAmount,
    transactionDisplayName: expense.transactionDisplayName,
    displayName: expense.userDisplayName,
    interval: expense.rsched.interval,
    params: JSON.stringify(expense.rsched.params),
  };
}

function sendBankMarketingEvents(recurringIncome: RecurringTransaction) {
  createMarketingEventsForUser(
    recurringIncome.userId.toString(),
    AnalyticsEvent.DaveBankingRecurringIncomeDetected,
    { recurringTransactionAmount: recurringIncome.userAmount },
  ).catch(
    partial(
      logNotificationError,
      recurringIncome,
      AnalyticsEvent.DaveBankingRecurringIncomeDetected,
    ),
  );
  if (recurringIncome.userAmount >= AdvanceApprovalClient.MINIMUM_PAYCHECK_AMOUNT) {
    createMarketingEventsForUser(
      recurringIncome.userId.toString(),
      AnalyticsEvent.CreditPopUnlockedNotification,
    ).catch(
      partial(logNotificationError, recurringIncome, AnalyticsEvent.CreditPopUnlockedNotification),
    );
  }
}

async function notifyIncomeStatusChange(
  income: RecurringTransaction,
  newStatus: RecurringTransactionStatus,
  previousStatus: RecurringTransactionStatus,
): Promise<void> {
  if (income.userAmount < 0) {
    logger.error('notifyIncomeStatusChange called on an expense', {
      recurringTransactionId: income.id,
      amount: income.userAmount,
    });
    return;
  }

  // MISSED is a virtual status, until that is
  // changed we check the explicitly passed in
  // status over the status field on the
  // recurring transaction
  if (previousStatus === newStatus) {
    logger.warn('no status change to notify', {
      recurringTransactionId: income.id,
    });
    return;
  }

  const bankAccount = await Utils.getBankAccount(income);
  if (!isNil(bankAccount)) {
    const institution = await Institution.findByPk(bankAccount.institutionId);
    const institutionName = institution?.displayName || '';
    const isMainPaycheck = bankAccount.mainPaycheckRecurringTransactionId === income.id;
    const payload = {
      userId: income.userId,
      institutionName,
      isMainPaycheck,
      recurringTransactionId: income.id,
      displayName: income.transactionDisplayName,
      status: newStatus,
      previousStatus,
    };
    createMarketingEventsForUser(
      income.userId.toString(),
      AnalyticsEvent.RecurringIncomeStatusChanged,
      payload,
    ).catch(partial(logNotificationError, income, AnalyticsEvent.RecurringIncomeStatusChanged));
    const userAttribute = {
      hasRecurringIncome: newStatus === RecurringTransactionStatus.VALID,
      lastIncomeUpdated: moment().toISOString(),
    };
    createMarketingAttributesForUser(income.userId.toString(), userAttribute).catch(
      partial(logNotificationError, income, AnalyticsEvent.RecurringIncomeStatusChanged),
    );
  } else {
    logger.error('No bank account for recurring transaction', {
      recurringTransactionId: income.id,
    });
  }
}

export default {
  sendTransactionMissed,
  notifyNewIncome,
  notifyAddExpense,
  notifyExpensesPredicted,
  notifyIncomeStatusChange,
};
