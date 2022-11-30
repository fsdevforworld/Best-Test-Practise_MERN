import * as Bluebird from 'bluebird';
import { compact, get, identity, isNil, reduce } from 'lodash';
import { Moment } from 'moment';
import { PossibleRecurringTransactionResponse } from '@dave-inc/wire-typings';
import { CUSTOM_ERROR_CODES, InvalidParametersError, NotFoundError } from '../../lib/error';
import { AuditLog } from '../../models';
import { publishNewRecurringTransaction } from './events';
import Notifications from './notifications';
import * as Forecast from '../forecast';
import * as Store from './store';
import * as Validate from './validate-recurring-transaction';
import * as Create from './create-recurring-transaction';
import * as Detect from './detect-recurring-transaction';
import * as ExpectedHelper from './generators';
import {
  ModificationSource,
  ExpectedTransaction,
  RecurringTransaction,
  CreateParams,
  UpdateParams,
} from './types';
import { RecurringTransactionStatus, TransactionType } from '../../typings';
import { ConstraintMessageKey } from '../../translations';
import * as Utils from './utils';

export {
  getById,
  getByUser,
  getUserIncomesByStatus,
  getByBankAccount,
  getExpectedByUser,
  getExpectedExpensesByUser,
} from './store';

export const getExpectedTransactionsByAccountId = ExpectedHelper.getByAccountId;
export const getNextExpectedPaycheckForAccount = ExpectedHelper.getNextExpectedPaycheckForAccount;
export const getNextExpectedTransaction = ExpectedHelper.getNextExpectedTransaction;

export const setInitialIncomeDetectionRequired = Detect.setInitialIncomeDetectionRequired;
export const isInitialIncomeDetectionActive = Detect.isInitialIncomeDetectionActive;

export { createUpdateExpectedTransactionsTask, updateExpectedTransactions } from './jobs';

export { ExpectedTransaction, ModificationSource, RecurringTransaction } from './types';
export * from './utils';
export { build } from './create-recurring-transaction';
export { createFromDates as createExpectedFromDates } from './generators';

async function buildRecurringTransaction(
  params: CreateParams,
  source: ModificationSource,
): Promise<[RecurringTransaction, CreateParams]> {
  const cleanedParams = Validate.sanitizeUserInput(params);
  const built = await Create.buildAndValidate(cleanedParams);

  if (source === ModificationSource.Admin) {
    built.status = RecurringTransactionStatus.VALID;
  }

  return [built, cleanedParams];
}

export async function saveRecurringTransactions(
  newRecurringTransactions: Detect.NewRecurringTransaction[],
): Promise<RecurringTransaction[]> {
  return Bluebird.resolve(newRecurringTransactions)
    .map(async newRecurringTransaction => {
      const rt = newRecurringTransaction.transaction;
      const [stored] = await Store.insert([rt]);
      if (stored) {
        publishNewRecurringTransaction({
          ...newRecurringTransaction,
          transaction: stored,
        });
        return stored;
      }
    })
    .filter(identity);
}

async function createInternal(
  params: CreateParams,
  source: ModificationSource = ModificationSource.API,
): Promise<[RecurringTransaction, CreateParams]> {
  const [built, cleanedParams] = await buildRecurringTransaction(params, source);
  const bankAccount = await Utils.getBankAccount(built);

  // if recurring transaction already exists (and is not deleted), insert will not occur
  const [result] = await saveRecurringTransactions([
    {
      transaction: built,
      institutionId: bankAccount.institutionId,
    },
  ]);

  const isSuccess = !isNil(result);
  const actual = isSuccess ? result : await Store.getDuplicate(built);

  // First transaction will be the main transaction
  const isIncome = actual.userAmount && actual.userAmount > 0;
  if (isIncome) {
    if (
      bankAccount.mainPaycheckRecurringTransactionId === null &&
      bankAccount.mainPaycheckRecurringTransactionUuid === null
    ) {
      await bankAccount.update({
        mainPaycheckRecurringTransactionId: actual.groundhogId ? null : actual.id,
        mainPaycheckRecurringTransactionUuid: actual.groundhogId ? actual.groundhogId : null,
      });
    }
    if (isSuccess) {
      Notifications.notifyNewIncome(actual, source);
    }
  }

  await Forecast.computeAccountForecast(bankAccount);
  return [actual, cleanedParams];
}

export async function create(params: CreateParams): Promise<RecurringTransaction> {
  const [recurringTransaction] = await createInternal(params, ModificationSource.API);
  return recurringTransaction;
}

export async function adminCreate(
  userId: number,
  adminId: number,
  params: CreateParams,
): Promise<RecurringTransaction> {
  const [recurringTransaction, cleanedParams] = await createInternal(
    params,
    ModificationSource.Admin,
  );
  const extra = { admin: adminId, newData: cleanedParams };
  await AuditLog.create({
    userId,
    type: 'RECURRING_TRANSACTION_CREATE',
    successful: true,
    extra,
  });
  return recurringTransaction;
}

export async function saveBulkExpense(
  userId: number,
  bankAccountId: number,
  allParams: CreateParams[],
  source: ModificationSource = ModificationSource.API,
) {
  const built = await Bluebird.map(allParams, async p => {
    const params = Object.assign({}, p, { userId, bankAccountId });
    const [recurringTransaction] = await buildRecurringTransaction(params, source);
    return recurringTransaction;
  });
  if (built.length > 0) {
    const bankAccount = await Utils.getBankAccount(built[0]);
    const newExpenses = built.map(rt => ({
      transaction: rt,
      institutionId: bankAccount.institutionId,
    }));
    const results = await saveRecurringTransactions(newExpenses);

    // save can return ids that are deleted. So we should re-query for new recurring
    const ids = compact(results.map(e => e.id));
    const stored = await Store.getByIds(ids, bankAccountId);

    if (stored.length > 0) {
      await Forecast.computeAccountForecast(bankAccount);
    }

    return stored;
  } else {
    return [];
  }
}

// TODO: combine detach and save operations in DB transaction
async function applyUpdates(
  recurringTransaction: RecurringTransaction,
  params: UpdateParams,
  source: ModificationSource,
): Promise<RecurringTransaction> {
  const updated: RecurringTransaction = { ...recurringTransaction, ...params };
  if (Validate.hasScheduleParams(params)) {
    Utils.updateRSched(updated, params);
  }

  if (source !== ModificationSource.Admin) {
    if (!params.skipValidityCheck) {
      const validityCheckOptions: Validate.PerformValidityCheckOptions = {};
      if (updated.userAmount > 0) {
        const canCreateSinglePaychecks = await Create.canCreateSingleTransactionPaychecks(
          updated.bankAccountId,
        );
        validityCheckOptions.requireMultipleObservations = !canCreateSinglePaychecks;
      }
      await Validate.performValidityCheck(updated, validityCheckOptions);
    } else {
      params.status = RecurringTransactionStatus.NOT_VALIDATED;
    }
  }

  if (Validate.hasScheduleParams(params)) {
    await Store.detachExpectedTransactions(recurringTransaction);
  }

  return Store.update(recurringTransaction.id, params);
}

type UpdateResponse = {
  recurringTransaction: RecurringTransaction;
  updateParams: UpdateParams;
  changes: object;
};

function getUpdateChanges(
  updated: RecurringTransaction,
  original: RecurringTransaction,
  updateParams: UpdateParams,
) {
  const getValue = (rt: RecurringTransaction, key: string) => {
    if (key === 'dtstart') {
      return rt.rsched.weeklyStart;
    } else {
      return get(rt, key) ?? get(rt.rsched, key);
    }
  };

  return reduce(
    updateParams,
    (changes, _, key) => {
      changes[key] = {
        newData: getValue(updated, key),
        originalData: getValue(original, key),
      };
      return changes;
    },
    {} as any,
  );
}

async function updateInternal(
  recurringTransaction: RecurringTransaction,
  params: UpdateParams,
  source: ModificationSource,
): Promise<UpdateResponse> {
  const cleanedParams = await Validate.sanitizeUpdateParams(recurringTransaction, params);
  const updatedTransaction = await applyUpdates(recurringTransaction, cleanedParams, source);

  await Forecast.computeAccountForecastFromBankAccountId(updatedTransaction.bankAccountId);

  return {
    recurringTransaction: updatedTransaction,
    updateParams: cleanedParams,
    changes: getUpdateChanges(updatedTransaction, recurringTransaction, cleanedParams),
  };
}

export async function update(
  recurringTransactionId: number,
  params: UpdateParams,
): Promise<RecurringTransaction> {
  const transaction = await Store.getById(recurringTransactionId);
  if (!transaction) {
    throw new NotFoundError('Recurring transaction not found.');
  }

  if (transaction.status === RecurringTransactionStatus.PENDING_VERIFICATION) {
    throw new InvalidParametersError(ConstraintMessageKey.ModifyFirstTransaction, {
      customCode: CUSTOM_ERROR_CODES.RECURRING_TRANSACTION_SHOULD_PROMOTE_PENDING,
    });
  }

  const result = await updateInternal(transaction, params, ModificationSource.API);
  await AuditLog.create({
    userId: result.recurringTransaction.userId,
    eventUuid: recurringTransactionId,
    type: 'USER_RECURRING_TRANSACTION_UPDATE',
    successful: true,
    extra: { updated: result.updateParams, changes: result.changes },
  });
  return result.recurringTransaction;
}

export async function adminUpdate(
  recurringTransactionId: number,
  adminId: number,
  params: UpdateParams,
): Promise<RecurringTransaction> {
  const transaction = await Store.getById(recurringTransactionId);
  if (!transaction) {
    throw new NotFoundError('Recurring transaction not found.');
  }

  const result = await updateInternal(transaction, params, ModificationSource.Admin);
  await AuditLog.create({
    userId: result.recurringTransaction.userId,
    eventUuid: recurringTransactionId,
    type: 'ADMIN_RECURRING_TRANSACTION_UPDATE',
    successful: true,
    extra: {
      admin: adminId,
      ...result.changes,
    },
  });
  return result.recurringTransaction;
}

export async function deleteById(recurringTransactionId: number): Promise<RecurringTransaction> {
  const recurringTransaction = await Store.getById(recurringTransactionId);
  if (!recurringTransaction) {
    throw new NotFoundError('Recurring transaction not found.');
  }
  const bankAccount = await Utils.getBankAccount(recurringTransaction);
  if (!bankAccount) {
    throw new NotFoundError(
      'The bank account associated with this recurring transaction has been deleted.',
    );
  }

  await Store.detachExpectedTransactions(recurringTransaction);
  await Store.deleteById(recurringTransaction.id);

  if (bankAccount.mainPaycheckRecurringTransactionId === recurringTransaction.id) {
    const allRecurring = await Store.getByBankAccount(bankAccount.id);
    const incomes = allRecurring.filter(txn => txn.userAmount > 0);
    if (incomes.length) {
      const largest = incomes.sort((a, b) => b.userAmount - a.userAmount)[0];
      bankAccount.mainPaycheckRecurringTransactionId = largest.groundhogId ? null : largest.id;
      bankAccount.mainPaycheckRecurringTransactionUuid = largest.groundhogId
        ? largest.groundhogId
        : null;
    } else {
      bankAccount.mainPaycheckRecurringTransactionId = null;
      bankAccount.mainPaycheckRecurringTransactionUuid = null;
    }
    await bankAccount.save();
  }

  await Forecast.computeAccountForecast(bankAccount);
  return recurringTransaction;
}

export async function adminDelete(recurringTransactionId: number, adminId: number): Promise<void> {
  const deleted = await deleteById(recurringTransactionId);
  const extra = {
    admin: adminId,
    originalData: {
      id: deleted.id,
      userAmount: deleted.userAmount,
      userDisplayName: deleted.userDisplayName,
      transactionDisplayName: deleted.transactionDisplayName,
      status: deleted.status,
      interval: deleted.rsched.interval.toUpperCase(),
      params: deleted.rsched.params,
      lastOccurrence: Utils.getLastOccurrence(deleted),
      nextOccurrence: Utils.getNextOccurrence(deleted),
      missed: deleted.missed,
      rollDirection: deleted.rsched.rollDirection,
    },
  };

  await AuditLog.create({
    userId: deleted.userId,
    type: 'RECURRING_TRANSACTION_DELETE',
    successful: true,
    extra,
  });
}

export async function detectIncome(
  bankAccountId: number,
): Promise<PossibleRecurringTransactionResponse[]> {
  let incomes = await Detect.detectRecurringTransactions(bankAccountId, TransactionType.INCOME);

  const noRecurringPaychecksExist = incomes.length === 0;
  if (noRecurringPaychecksExist) {
    const canCreateSinglePaychecks = await Create.canCreateSingleTransactionPaychecks(
      bankAccountId,
    );
    if (canCreateSinglePaychecks) {
      incomes = await Detect.getSingleTransactionPossibleRecurringIncome(bankAccountId);
    }
  }
  return incomes;
}

export async function detectExpenses(
  bankAccountId: number,
): Promise<PossibleRecurringTransactionResponse[]> {
  return Detect.detectRecurringTransactions(bankAccountId, TransactionType.EXPENSE);
}

export async function getExpectedByRecurringTransactionId(
  recurringTransactionId: number,
  start: Moment | string,
  end?: Moment | string,
): Promise<ExpectedTransaction[]> {
  const recurringTransaction = await Store.getById(recurringTransactionId);
  if (!recurringTransaction) {
    throw new NotFoundError('Recurring Transaction not found.');
  }
  return ExpectedHelper.getByRecurringTransaction(recurringTransaction, start, end);
}
