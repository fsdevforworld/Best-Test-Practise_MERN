import { moment } from '@dave-inc/time-lib';
import {
  BankTransactionResponse,
  ExpectedTransactionResponse,
  RecurringTransactionResponse,
  RecurringTransactionStatus as ExternalRecurringTransactionTStatus,
} from '@dave-inc/wire-typings';
import * as Bluebird from 'bluebird';
import { pick } from 'lodash';
import { Moment } from 'moment';
import * as RecurringTransactionDomain from '../domain/recurring-transaction';
import { ExpectedTransaction, RecurringTransaction } from '../domain/recurring-transaction';
import { LookbackPeriod } from '../domain/recurring-transaction/types';
import { getLocalTime, getTimezone } from '../domain/user-setting';
import { formatDisplayName } from '../lib/format-transaction-name';
import { BankAccount, User } from '../models';
import { RecurringTransactionStatus } from '../typings';
import { serializeDate } from './';
import AdvanceApprovalClient from '../lib/advance-approval-client';
import { AdvanceApprovalTrigger } from '../services/advance-approval/types';
import { getAdvanceSummary } from '../domain/advance-approval-request';

function mapRecurringTransactionStatus(
  status: RecurringTransactionStatus,
): ExternalRecurringTransactionTStatus {
  if (status === RecurringTransactionStatus.SINGLE_OBSERVATION) {
    return ExternalRecurringTransactionTStatus.VALID;
  } else {
    return status as ExternalRecurringTransactionTStatus;
  }
}

export async function serializeRecurringTransactionResponse(
  recurringTransactions: RecurringTransaction[],
  user: User,
  bankAccount: BankAccount,
): Promise<RecurringTransactionResponse[]> {
  return Bluebird.mapSeries(recurringTransactions, async recurringTransaction =>
    serializeSingleRecurringTransactionResponse(recurringTransaction, user, bankAccount),
  );
}

export async function serializeSingleRecurringTransactionResponse(
  recurringTransaction: RecurringTransaction,
  user: User,
  bankAccount: BankAccount,
  options: {
    lookbackPeriod?: number;
  } = {},
): Promise<RecurringTransactionResponse> {
  const { lookbackPeriod } = options;
  const today = await getLocalTime(user.id);
  const userTimezone = await getTimezone(user.id);
  const advanceApproval = await AdvanceApprovalClient.createSingleApproval({
    bankAccountId: bankAccount.id,
    advanceSummary: await getAdvanceSummary(user.id),
    userId: user.id,
    recurringTransactionId: recurringTransaction.id,
    trigger: AdvanceApprovalTrigger.GetPaychecks,
    userTimezone,
  });
  return Bluebird.props({
    expected: getPaycheckExpectedJSON(recurringTransaction, today),
    observations: getBankTransactionsJSON(recurringTransaction, today, lookbackPeriod),
    id: recurringTransaction.id,
    userAmount: recurringTransaction.userAmount,
    userDisplayName: recurringTransaction.userDisplayName,
    transactionDisplayName: recurringTransaction.transactionDisplayName
      ? formatDisplayName(recurringTransaction.transactionDisplayName)
      : '',
    interval: recurringTransaction.rsched.interval.toUpperCase(),
    params: recurringTransaction.rsched.params,
    status: mapRecurringTransactionStatus(recurringTransaction.status),
    lastOccurrence: RecurringTransactionDomain.getLastOccurrence(recurringTransaction, today),
    nextOccurrence: RecurringTransactionDomain.getNextOccurrence(recurringTransaction, today),
    missed:
      recurringTransaction.missed &&
      recurringTransaction.rsched.before(recurringTransaction.missed, true).format('YYYY-MM-DD'),
    advanceApproval:
      advanceApproval && pick(advanceApproval, ['approved', 'approvedAmounts', 'rejectionReasons']),
    rollDirection: recurringTransaction.rsched.rollDirection,
  });
}

export function serializeExpectedTransaction(
  expectedTransaction: ExpectedTransaction,
): ExpectedTransactionResponse {
  return Object.assign(
    {},
    pick(expectedTransaction, [
      'id',
      'bankAccountId',
      'userId',
      'recurringTransactionId',
      'displayName',
      'pendingDisplayName',
      'expectedAmount',
      'settledAmount',
      'extra',
      'status',
    ]),
    {
      expectedDate: serializeDate(expectedTransaction.expectedDate, 'YYYY-MM-DD'),
      pendingDate: serializeDate(expectedTransaction.pendingDate, 'YYYY-MM-DD'),
      created: serializeDate(expectedTransaction.created),
      updated: serializeDate(expectedTransaction.updated),
      deleted: serializeDate(expectedTransaction.deleted),
    },
  );
}

async function getPaycheckExpectedJSON(
  recurringTransaction: RecurringTransaction,
  today: Moment,
): Promise<ExpectedTransactionResponse> {
  const expected = await RecurringTransactionDomain.getNextExpectedTransaction(
    recurringTransaction,
    today,
  );
  return serializeExpectedTransaction(expected);
}

export async function getBankTransactionsJSON(
  recurringTransaction: RecurringTransaction,
  today: Moment = moment(),
  lookbackPeriod: number = LookbackPeriod.Default,
): Promise<BankTransactionResponse[]> {
  return RecurringTransactionDomain.getMatchingBankTransactions(
    recurringTransaction,
    today,
    lookbackPeriod,
  );
}
