import { AuditLog, BankAccount, BankConnection, BankConnectionTransition } from '../../models';
import { Moment } from 'moment';
import * as Bluebird from 'bluebird';
import { RecurringTransactionStatus, TransactionType } from '../../typings';
import { moment } from '@dave-inc/time-lib';
import * as _ from 'lodash';
import { getByRecurringTransaction } from './generators';
import logger from '../../lib/logger';
import * as Store from './store';
import {
  CreateParams,
  ExpectedTransaction,
  ExpectedTransactionStatus,
  RecurringTransaction,
} from './types';
import { buildAndValidate } from './create-recurring-transaction';
import {
  _filterAndSortBankTransactions,
  _updateFromBankTransaction,
  expectedRecurringTransactionWindow,
  getSortByClosestToExpected,
  transactionLookBackStartDate,
} from './match-expected-transactions';
import { metrics, RecurringTransactionMetrics as Metrics } from './metrics';
import ErrorHelper from '@dave-inc/error-helper';
import HeathClient from '../../lib/heath-client';
import { BankTransaction, SortOrder } from '@dave-inc/heath-client';

export type MatchPreviousAccountIncomeResult = {
  oldIncome: RecurringTransaction;
  matchedTransactions: Array<[ExpectedTransaction, BankTransaction]>;
  toBankAccount: BankAccount;
};

export async function matchPreviousAccountIncome(
  bankAccount: BankAccount,
): Promise<MatchPreviousAccountIncomeResult[]> {
  metrics.increment(Metrics.MATCH_PREVIOUS_ACCOUNT_INCOME_ATTEMPT);
  try {
    const existingIncome = await Store.getByBankAccount(bankAccount.id, { includeDeleted: true });
    if (existingIncome.length) {
      metrics.increment(Metrics.MATCH_PREVIOUS_ACCOUNT_ALREADY_HAS_INCOME);
      return [];
    }

    const result = await _matchPreviousAccountIncome(bankAccount);

    metrics.increment(Metrics.MATCH_PREVIOUS_ACCOUNT_INCOME_SUCCESS);

    return _.compact(result);
  } catch (err) {
    logger.error('Error matching previous account income', {
      err: ErrorHelper.logFormat(err),
      bankAccountId: bankAccount.id,
    });
    metrics.increment(Metrics.MATCH_PREVIOUS_ACCOUNT_INCOME_FAILURE);
  }
}

export async function doIncomeTransition(
  matchResult: MatchPreviousAccountIncomeResult,
): Promise<RecurringTransaction> {
  const { oldIncome, matchedTransactions, toBankAccount } = matchResult;

  const newRecurringTransaction = await copyRecurringTransaction(oldIncome, toBankAccount);
  await Bluebird.map(matchedTransactions, async match => {
    const expectedTransaction = match[0];
    const bankTransaction = match[1];

    logger.info('Updating expected transaction to new recurring transaction', {
      expectedTransactionId: expectedTransaction.id,
      oldRecurringTransactionId: expectedTransaction.recurringTransactionId,
      newRecurringTransactionId: newRecurringTransaction.id,
    });

    await _updateFromBankTransaction(expectedTransaction, bankTransaction, newRecurringTransaction);

    return Store.updateExpectedTransaction(expectedTransaction.id, {
      recurringTransactionId: newRecurringTransaction.id,
    });
  });

  await Store.deleteById(oldIncome.id);

  return newRecurringTransaction;
}

async function _matchPreviousAccountIncome(
  bankAccount: BankAccount,
): Promise<MatchPreviousAccountIncomeResult[]> {
  const fromBankAccountId = await getOldBankAccountId(bankAccount);

  if (!fromBankAccountId) {
    return [];
  }

  const recurringTransactions = await Store.getByBankAccount(fromBankAccountId, {
    type: TransactionType.INCOME,
    status: RecurringTransactionStatus.VALID,
  });

  return Bluebird.map(recurringTransactions, _.partial(matchExistingIncome, bankAccount));
}

async function matchExistingIncome(
  bankAccount: BankAccount,
  recurringTransaction: RecurringTransaction,
): Promise<MatchPreviousAccountIncomeResult | null> {
  logger.info('Attempting existing income match', {
    recurringTransactionId: recurringTransaction.id,
    bankAccountId: bankAccount.id,
  });

  const startDate = transactionLookBackStartDate(moment());
  const predictedTransactions = await getByRecurringTransaction(
    recurringTransaction,
    startDate,
    moment(),
    { status: ExpectedTransactionStatus.PREDICTED },
  );

  if (!predictedTransactions) {
    logger.info('Recurring transaction has no predicted transactions', {
      recurringTransactionId: recurringTransaction.id,
      bankAccountId: bankAccount.id,
    });
    return null;
  }

  const matchingBankTransactions = await getMatchingBankTransactions(
    startDate,
    bankAccount,
    recurringTransaction,
  );

  if (!matchingBankTransactions.length) {
    logger.info('BankAccount has no matching bank transactions', {
      recurringTransactionId: recurringTransaction.id,
      bankAccountId: bankAccount.id,
    });
    return null;
  }

  const matchedTransactions = matchTransactionsToExpected(
    matchingBankTransactions,
    predictedTransactions,
    recurringTransaction,
  );

  if (!matchedTransactions.length) {
    logger.info('Could not match any expected transactions to bank transactions', {
      recurringTransactionId: recurringTransaction.id,
      bankAccountId: bankAccount.id,
    });
    return null;
  }

  return {
    oldIncome: recurringTransaction,
    toBankAccount: bankAccount,
    matchedTransactions,
  };
}

async function copyRecurringTransaction(
  recurringTransaction: RecurringTransaction,
  toBankAccount: BankAccount,
): Promise<RecurringTransaction> {
  const params: CreateParams = {
    ...recurringTransaction,
    bankAccountId: toBankAccount.id,
    interval: recurringTransaction.rsched.interval,
    params: recurringTransaction.rsched.params,
    rollDirection: recurringTransaction.rsched.rollDirection,
  };

  const built = await buildAndValidate(_.omit(params, ['id']));
  const [newRecurringTransaction] = await Store.insert([built]);

  if (_.isNil(newRecurringTransaction)) {
    const msg = 'Failed to copy recurring transaction to new bank account';
    logger.error(msg, {
      fromBankAccountId: recurringTransaction.bankAccountId,
      toBankAccountId: toBankAccount.id,
      oldRecurringTransactionId: recurringTransaction.id,
    });

    throw new Error(msg);
  }

  const data = {
    fromBankAccountId: recurringTransaction.bankAccountId,
    toBankAccountId: toBankAccount.id,
    oldRecurringTransactionId: recurringTransaction.id,
    newRecurringTransactionId: newRecurringTransaction.id,
  };
  logger.info('Copied recurring transaction to new bank account', data);

  await AuditLog.create({
    userId: newRecurringTransaction.userId,
    type: AuditLog.TYPES.DETECT_INCOME_ACCOUNT_TRANSITION,
    successful: true,
    eventUuid: newRecurringTransaction.id,
    message: `Detected that income transitioned between bank accounts from ${recurringTransaction.bankAccountId} to ${toBankAccount.id}`,
    extra: data,
  });

  return newRecurringTransaction;
}

function matchTransactionsToExpected(
  bankTransactions: BankTransaction[],
  expectedTransactions: ExpectedTransaction[],
  recurringTransaction: RecurringTransaction,
): Array<[ExpectedTransaction, BankTransaction]> {
  const matchedTransactions: Array<[ExpectedTransaction, BankTransaction]> = [];
  expectedTransactions.forEach(expectedTransaction => {
    const dateRange = expectedRecurringTransactionWindow(
      expectedTransaction.expectedDate,
      recurringTransaction.rsched,
    );
    const matchingBankTransactions = bankTransactions
      .filter(transaction =>
        moment(transaction.transactionDate).isBetween(dateRange.start, dateRange.end, 'day', '[]'),
      )
      .sort(getSortByClosestToExpected(expectedTransaction));

    if (matchingBankTransactions.length) {
      const bankTransaction = matchingBankTransactions[0];
      matchedTransactions.push([expectedTransaction, bankTransaction]);
      bankTransactions = bankTransactions.filter(t => t.id !== bankTransaction.id);
    }
  });

  return matchedTransactions;
}

async function getMatchingBankTransactions(
  startDate: Moment,
  bankAccount: BankAccount,
  recurringTransaction: RecurringTransaction,
): Promise<BankTransaction[]> {
  const matchingTransactions = await HeathClient.getBankTransactions(
    bankAccount.id,
    {
      transactionDate: {
        gte: startDate.ymd(),
      },
      or: [
        { displayName: recurringTransaction.transactionDisplayName },
        { displayName: recurringTransaction.pendingDisplayName },
      ],
    },
    {
      order: { transactionDate: SortOrder.DESC },
    },
  );

  return _filterAndSortBankTransactions(matchingTransactions, recurringTransaction);
}

async function getOldBankAccountId(bankAccount: BankAccount): Promise<number | null> {
  const eligibleBankConnTransition = await BankConnectionTransition.findOne({
    include: [
      {
        as: 'toBankConnection',
        include: [
          {
            model: BankAccount,
            where: { id: bankAccount.id },
          },
        ],
        model: BankConnection,
      },
    ],
    where: {
      hasReceivedFirstPaycheck: true,
      hasReceivedRecurringPaycheck: false,
    },
  });

  if (!eligibleBankConnTransition) {
    logger.info('Bank account has no eligible toBankConnectionTransitions', {
      bankAccountId: bankAccount.id,
    });
    return null;
  }

  return eligibleBankConnTransition.fromDefaultBankAccountId;
}
