import * as Bluebird from 'bluebird';
import { compact } from 'lodash';
import { BankAccount, BankConnection, BankConnectionTransition } from '../../models';
import { InvalidParametersError, NotFoundError } from '../../lib/error';
import { RecurringTransactionStatus, TransactionType } from '../../typings';
import { getBestScheduleMatch } from './detect-recurring-schedule';
import { build as dbBuild } from './store';
import { CreateParams, RecurringTransaction } from './types';
import {
  isCashDeposit,
  performValidityCheck,
  PerformValidityCheckOptions,
} from './validate-recurring-transaction';
import { updateRSched } from './utils';
import HeathClient from '../../lib/heath-client';
import { moment } from '@dave-inc/time-lib';

// Route through DB object build for default values
export const build = dbBuild;

async function buildValidityCheckOptions(
  recurringTransaction: RecurringTransaction,
  useReadReplica: boolean = false,
): Promise<PerformValidityCheckOptions> {
  const validityCheckOptions: PerformValidityCheckOptions = { useReadReplica };
  if (recurringTransaction.userAmount > 0) {
    if (recurringTransaction.status === RecurringTransactionStatus.SINGLE_OBSERVATION) {
      validityCheckOptions.requireMultipleObservations = false;
    } else {
      const { bankAccountId } = recurringTransaction;
      const allowedToMakeSinglePaychecks = await canCreateSingleTransactionPaychecks(bankAccountId);
      validityCheckOptions.requireMultipleObservations = !allowedToMakeSinglePaychecks;
    }
  }
  return validityCheckOptions;
}

export async function buildAndValidate(
  params: CreateParams,
  useReadReplica: boolean = false,
): Promise<RecurringTransaction> {
  let recurringTransaction = build(params);

  if (params.bankTransactionId) {
    recurringTransaction = await buildFromBankTransaction(
      recurringTransaction,
      params.bankTransactionId,
    );
  } else if (!params.userAmount || !params.userDisplayName) {
    throw new InvalidParametersError('User amount and user display name must be provided');
  }

  if (params.fromTransactionDisplayName) {
    // Should belong to a previous account for the same user.
    recurringTransaction = await buildFromPreviousPossibleRecurringTransaction(
      recurringTransaction,
      params.fromTransactionDisplayName,
    );
  } else if (params.skipValidityCheck) {
    recurringTransaction.status = RecurringTransactionStatus.NOT_VALIDATED;
  } else {
    if (recurringTransaction.status !== RecurringTransactionStatus.SINGLE_OBSERVATION) {
      recurringTransaction.status = RecurringTransactionStatus.VALID;
    }

    const validityCheckOptions = await buildValidityCheckOptions(
      recurringTransaction,
      useReadReplica,
    );
    await performValidityCheck(recurringTransaction, validityCheckOptions);

    if (
      isCashDeposit(recurringTransaction.transactionDisplayName, recurringTransaction.userAmount)
    ) {
      recurringTransaction.status = RecurringTransactionStatus.INVALID_NAME;
    }
  }

  return recurringTransaction;
}

async function buildFromBankTransaction(
  recurringTransaction: RecurringTransaction,
  bankTransactionId: number,
): Promise<RecurringTransaction> {
  const bankTransaction = await HeathClient.getBankTransactionById(
    bankTransactionId,
    recurringTransaction.bankAccountId,
  );
  if (!bankTransaction) {
    throw new NotFoundError('Bank Transaction not found');
  }
  if (Math.sign(bankTransaction.amount) !== Math.sign(recurringTransaction.userAmount)) {
    throw new InvalidParametersError('User submitted amount must have same sign as transaction');
  }
  const bankAccount = await BankAccount.findByPk(bankTransaction.bankAccountId);
  if (!bankAccount) {
    throw new NotFoundError('Bank Account not found');
  }

  const built: RecurringTransaction = {
    ...recurringTransaction,
    userId: bankAccount.userId,
    pendingDisplayName: bankTransaction.pendingDisplayName,
    transactionDisplayName: bankTransaction.displayName,
  };
  updateRSched(built, { dtstart: moment(bankTransaction.transactionDate) });
  if (!built.userAmount) {
    built.userAmount = bankTransaction.amount;
  }
  if (!built.userDisplayName) {
    built.userDisplayName = bankTransaction.displayName;
  }
  return built;
}

async function buildFromPreviousPossibleRecurringTransaction(
  recurringTransaction: RecurringTransaction,
  fromTransactionDisplayName: string,
): Promise<RecurringTransaction> {
  const transitions: BankConnectionTransition[] = await BankConnectionTransition.getByToBankAccountId(
    recurringTransaction.bankAccountId,
  );

  if (transitions.length === 0) {
    throw new NotFoundError('No accounts to transition from');
  }

  const transactionType =
    recurringTransaction.userAmount > 0 ? TransactionType.INCOME : TransactionType.EXPENSE;

  const detectionResults = await Bluebird.map(transitions, async transition => {
    const transactions = await HeathClient.getBankTransactionsByDisplayName(
      transition.fromDefaultBankAccountId,
      fromTransactionDisplayName,
    );

    if (transactions.length === 0) {
      return null;
    }

    const dates = transactions.map(t => moment(t.transactionDate));
    const match = getBestScheduleMatch(dates);

    if (match) {
      return transactions[0];
    }
  });

  const [possibleRecurringTransaction] = compact(detectionResults);

  if (!possibleRecurringTransaction) {
    throw new NotFoundError('Possible recurring transaction not found');
  }

  const { amount, displayName, transactionDate } = possibleRecurringTransaction;
  const built: RecurringTransaction = {
    ...recurringTransaction,
    transactionDisplayName: displayName,
    userAmount: amount,
    userDisplayName: recurringTransaction.userDisplayName || displayName,
  };
  updateRSched(built, { dtstart: moment(transactionDate) });

  const isPaycheck = transactionType === TransactionType.INCOME;
  if (isPaycheck) {
    built.status = RecurringTransactionStatus.PENDING_VERIFICATION;
  }

  return built;
}

export async function canCreateSingleTransactionPaychecks(bankAccountId: number): Promise<boolean> {
  const bankConnectionTransition = await BankConnectionTransition.findOne({
    include: [
      {
        as: 'toBankConnection',
        include: [
          {
            model: BankAccount,
            where: { id: bankAccountId },
          },
        ],
        model: BankConnection,
      },
    ],
  });

  if (!bankConnectionTransition) {
    return false;
  }

  const { hasReceivedRecurringPaycheck } = bankConnectionTransition;

  return !hasReceivedRecurringPaycheck;
}

const CreateRecurringTransaction = {
  buildAndValidate,
  canCreateSingleTransactionPaychecks,
};

export default CreateRecurringTransaction;
