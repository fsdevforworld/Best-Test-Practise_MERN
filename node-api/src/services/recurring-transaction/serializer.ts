import { ExpectedTransaction, RecurringTransaction } from '../../domain/recurring-transaction';

export function serializeRecurringTransaction(recurringTransaction: RecurringTransaction) {
  return {
    id: recurringTransaction.id,
    bankAccountId: recurringTransaction.bankAccountId,
    userId: recurringTransaction.userId,
    transactionDisplayName: recurringTransaction.transactionDisplayName,
    rsched: {
      interval: recurringTransaction.rsched.interval,
      params: recurringTransaction.rsched.params,
    },
    userAmount: recurringTransaction.userAmount,
    userDisplayName: recurringTransaction.userDisplayName,
    pendingDisplayName: recurringTransaction.pendingDisplayName,
    type: recurringTransaction.type,
    status: recurringTransaction.status,
    missed: recurringTransaction.missed?.format(),
    terminated: recurringTransaction.terminated?.format(),
    groundhogId: recurringTransaction.groundhogId,
  };
}

export function serializeExpectedTransaction(expectedTransaction: ExpectedTransaction) {
  return {
    id: expectedTransaction.id,
    bankAccountId: expectedTransaction.bankAccountId,
    userId: expectedTransaction.userId,
    recurringTransactionId: expectedTransaction.recurringTransactionId,
    type: expectedTransaction.type,
    displayName: expectedTransaction.displayName,
    pendingDisplayName: expectedTransaction.pendingDisplayName,
    expectedAmount: expectedTransaction.expectedAmount,
    pendingAmount: expectedTransaction.pendingAmount,
    settledAmount: expectedTransaction.settledAmount,
    expectedDate: expectedTransaction.expectedDate.ymd(),
    pendingDate: expectedTransaction.pendingDate?.ymd(),
    settledDate: expectedTransaction.settledDate?.ymd(),
    status: expectedTransaction.status,
    groundhogId: expectedTransaction.groundhogId,
  };
}
