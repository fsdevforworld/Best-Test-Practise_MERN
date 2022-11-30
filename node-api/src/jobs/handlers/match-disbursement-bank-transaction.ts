import { MinimalRequest } from '@dave-inc/google-cloud-tasks-helpers';
import * as Bluebird from 'bluebird';
import { last, uniq } from 'lodash';
import { QueryTypes } from 'sequelize';
import logger from '../../lib/logger';
import { sequelize } from '../../models';
import { Advance, BankAccount } from '../../models';
import { Moment } from 'moment';
import { dogstatsd } from '../../lib/datadog-statsd';
import HeathClient from '../../lib/heath-client';

import { MatchDisbursementBankTransactionData } from '../data';
import { moment } from '@dave-inc/time-lib';
import { TaskTooEarlyError, shouldTaskUseReadReplica } from '../../helper/read-replica';

// Number of days after an advance is created that a bank transaction
// can be attached to an advance.
const ADVANCE_CREATED_AT_BUFFER = 6;

const METRIC_LABEL = 'match_disbursement_bank_transaction';

// Whitelist for the bank transactions to potentially match.
export const displayNameWhitelist = [
  'dave',
  'cbw',
  'visa direct',
  'visa transfer',
  'visa money',
  'express advances',
  'standard advances',
];
export const displayNameWhitelistWildcard = displayNameWhitelist.map(value => `%${value}%`);

function getEarliestTransactionDate(advanceDate: Moment): Moment {
  return advanceDate.clone().subtract(1, 'days');
}

const MatchDisbursementBankTransactionMaxLag = 12 * 60 * 60;

/**
 * Tries to add a bank transaction id to advance disbursements.
 *
 * Incoming bank transaction ids are all from the same bank connection,
 * and therefore from the same user, although they can be from a handful
 * of different bank accounts.
 *
 * Pending transactions are added here, too. If they get deleted later,
 * the foreign key will automatically set the advance column to null.
 */
export async function matchDisbursementBankTransaction(
  { bankConnectionId }: MatchDisbursementBankTransactionData,
  req: MinimalRequest<MatchDisbursementBankTransactionData>,
): Promise<void> {
  try {
    dogstatsd.increment(`${METRIC_LABEL}.task_started`);

    const useReadReplica = await shouldTaskUseReadReplica(
      req,
      MatchDisbursementBankTransactionMaxLag,
    );
    await matchTransactionsForBankConnection(bankConnectionId, useReadReplica);

    dogstatsd.increment(`${METRIC_LABEL}.task_completed`);
  } catch (error) {
    if (error instanceof TaskTooEarlyError) {
      dogstatsd.increment(`${METRIC_LABEL}.task_deferred`);
      logger.warn('Deferring match-disbursement-bank-transactions job', {
        error,
        data: error.data as object,
      });
    } else {
      dogstatsd.increment(`${METRIC_LABEL}.task_failed`);
      logger.error('Error processing match-disbursement-bank-transactions job', { error });
    }
    throw error;
  }
}

async function matchTransactionsForBankConnection(
  bankConnectionId: number,
  useReadReplica: boolean = false,
): Promise<void> {
  // Any advance disbursements looking for bank transactions?
  const advances: Advance[] = await sequelize.query(
    `
      SELECT
        a.*
      FROM ${Advance.getTableName()} a
      INNER JOIN ${BankAccount.getTableName()} b
        ON b.id = a.bank_account_id
        AND b.bank_connection_id = ?
      WHERE
        a.disbursement_bank_transaction_id IS NULL
        AND a.created_date > NOW() - INTERVAL 1 WEEK
      ORDER BY created_date DESC
    `,
    {
      mapToModel: true,
      model: sequelize.models.Advance, // Passes typechecking...
      replacements: [bankConnectionId],
      type: QueryTypes.SELECT,
      useMaster: !useReadReplica,
    },
  );

  if (advances.length === 0) {
    dogstatsd.increment(`${METRIC_LABEL}.no_advances_found`);
    return;
  }

  // Grab bank transactions that could apply.
  const bankAccountIds = uniq(advances.map(adv => adv.bankAccountId));
  const takenBankTransactionResults: Array<{
    disbursementBankTransactionId: number;
  }> = await sequelize.query(
    `
      SELECT
        a.disbursement_bank_transaction_id AS disbursementBankTransactionId
      FROM ${Advance.getTableName()} a
      WHERE
        a.bank_account_id IN (?)
        AND a.disbursement_bank_transaction_id IS NOT NULL
    `,
    {
      replacements: [bankAccountIds],
      type: QueryTypes.SELECT,
      useMaster: !useReadReplica,
    },
  );
  const takenBankTransactionIds: number[] = takenBankTransactionResults.map(
    (result: { disbursementBankTransactionId: number }) => result.disbursementBankTransactionId,
  );
  const possibleAmounts = uniq(advances.map(adv => adv.amount));
  const bankTransactions = await HeathClient.getBankTransactions(
    bankAccountIds,
    {
      amount: { in: possibleAmounts },
      displayName: { like: displayNameWhitelistWildcard },
      id: { notIn: takenBankTransactionIds },
      transactionDate: {
        gte: getEarliestTransactionDate(last(advances).createdDate).format('YYYY-MM-DD'),
      },
    },
    { useReadReplica },
  );
  if (!bankTransactions.length) {
    dogstatsd.increment(`${METRIC_LABEL}.no_transactions_found`);
    return;
  }

  await Bluebird.each(advances, async advance => {
    // Disbursement only possible within advance time window.
    const advanceDate = advance.createdDate.clone().startOf('day');
    const earliest = getEarliestTransactionDate(advanceDate);
    const latest = advanceDate.clone().add(ADVANCE_CREATED_AT_BUFFER, 'days');
    const possibleBankTransactions = bankTransactions.filter(pTxn => {
      const pTxnDate = moment(pTxn.transactionDate).startOf('day');
      return (
        pTxn.bankAccountId === advance.bankAccountId &&
        pTxnDate.isSameOrAfter(earliest) &&
        pTxnDate.isSameOrBefore(latest)
      );
    });
    const txn = possibleBankTransactions.find(a => a.amount === advance.amount);
    if (txn) {
      await advance.update({
        disbursementBankTransactionId: txn.id,
        disbursementBankTransactionUuid: txn.bankTransactionUuid,
      });
      // Don't add this txn to subsequent advances.
      const txnIndex = bankTransactions.findIndex(a => a.id === txn.id);
      bankTransactions.splice(txnIndex, 1);
    }
  });
}
