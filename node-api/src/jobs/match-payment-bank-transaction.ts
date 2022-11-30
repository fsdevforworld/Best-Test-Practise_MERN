import ErrorHelper from '@dave-inc/error-helper';
import * as Bluebird from 'bluebird';
import * as Queue from 'bull';
import { map, uniq } from 'lodash';
import { QueryTypes } from 'sequelize';
import logger from '../lib/logger';
import { BankAccount, Payment, sequelize } from '../models';
import PaymentMethod from '../models/payment-method';
import BankConnection from '../models/bank-connection';
import JobManager from '../lib/job-manager';
import HeathClient from '../lib/heath-client';
import { SortOrder } from '@dave-inc/heath-client';
import { moment } from '@dave-inc/time-lib';
import { publishPaymentUpdateEvent } from '../domain/payment/loomis-migration';

export type MatchPaymentBankTransactionQueueData = {
  bankConnectionId: number;
};

// Number of days after a payment is created that a bank transaction
// can be attached to a payment.
const CREATED_AT_BUFFER = 6;

/**
 * Tries to add a bank transaction id to advance payments.
 *
 * Incoming bank transaction ids are all from the same bank connection,
 * and therefore from the same user, although they can be from a handful
 * of different bank accounts.
 *
 * Pending transactions are added here, too. If they get deleted later,
 * the foreign key will automatically set the advance column to null.
 */
async function process(job: Queue.Job<MatchPaymentBankTransactionQueueData>): Promise<void> {
  try {
    const { bankConnectionId } = job.data;
    const attributes = map(Payment.rawAttributes, value => `p.${value.field}`)
      .filter(field => field !== 'p.bank_account_id')
      .join(', ');

    const unmatchedPayments: Payment[] = await sequelize.query(
      `
         SELECT
          ${attributes}, ba.id as bank_account_id
        FROM ${Payment.getTableName()} p
          INNER JOIN ${PaymentMethod.getTableName()} pm ON pm.id = p.payment_method_id
          INNER JOIN ${BankAccount.getTableName()} ba ON ba.id = pm.bank_account_id
          INNER JOIN ${BankConnection.getTableName()} bc ON bc.id = ba.bank_connection_id
        WHERE
          bc.id = ? AND
          p.bank_transaction_id IS NULL
        UNION
        SELECT
          ${attributes}, ba.id as bank_account_id
        FROM ${Payment.getTableName()} p
          INNER JOIN ${BankAccount.getTableName()} ba ON ba.id = p.bank_account_id
          INNER JOIN ${BankConnection.getTableName()} bc ON bc.id = ba.bank_connection_id
        WHERE
          bc.id = ? AND
          p.bank_transaction_id IS NULL AND
          p.created > NOW() - INTERVAL 1 WEEK
        ORDER BY created ASC;
      `,
      {
        mapToModel: true,
        model: sequelize.models.Payment, // Passes typechecking...
        replacements: [bankConnectionId, bankConnectionId],
        type: QueryTypes.SELECT,
      },
    );
    if (unmatchedPayments.length === 0) {
      return;
    }

    const bankAccountIds = uniq(unmatchedPayments.map(p => p.bankAccountId));
    const takenBankTransactionResults: Array<{
      paymentBankTransactionId: number;
    }> = await sequelize.query(
      `
        SELECT
          p.bank_transaction_id AS paymentBankTransactionId
        FROM ${Payment.getTableName()} p
        WHERE
          p.bank_account_id IN (?)
          AND p.bank_transaction_id IS NOT NULL
      `,
      {
        replacements: [bankAccountIds],
        type: QueryTypes.SELECT,
      },
    );
    const takenBankTransactionIds = takenBankTransactionResults.map(
      result => result.paymentBankTransactionId,
    );
    const possibleAmounts = uniq(unmatchedPayments.map(p => p.amount * -1));
    const bankTransactions = await HeathClient.getBankTransactions(
      bankAccountIds,
      {
        // Chronological so that oldest matches are found first.
        amount: possibleAmounts,
        id: { notIn: takenBankTransactionIds },
        transactionDate: {
          gte: unmatchedPayments[0].created.format('YYYY-MM-DD'),
        },
      },
      { order: { transactionDate: SortOrder.ASC } },
    );

    if (!bankTransactions.length) {
      return;
    }

    await Bluebird.each(unmatchedPayments, async payment => {
      // Payment only possible within advance time window.
      const earliest = payment.created.clone().startOf('day');
      const latest = earliest.clone().add(CREATED_AT_BUFFER, 'days');
      const possibleBankTransactions = bankTransactions.filter(pTxn => {
        const pTxnDate = moment(pTxn.transactionDate).startOf('day');
        return (
          pTxn.bankAccountId === payment.bankAccountId &&
          pTxnDate.isSameOrAfter(earliest) &&
          pTxnDate.isSameOrBefore(latest)
        );
      });
      const txn = possibleBankTransactions.find(a => a.amount === payment.amount * -1);
      if (txn) {
        await payment.update({
          bankTransactionId: txn.id,
          bankTransactionUuid: txn.bankTransactionUuid,
        });
        await publishPaymentUpdateEvent({
          legacyId: payment.id,
          bankTransactionId: txn.bankTransactionUuid,
        });
        // Don't add this txn to subsequent advances.
        const txnIndex = bankTransactions.findIndex(a => a.id === txn.id);
        bankTransactions.splice(txnIndex, 1);
      }
    });
  } catch (error) {
    const formattedError = ErrorHelper.logFormat(error);
    logger.error('Error processing match-payment-bank-transactions job', formattedError);
    throw error;
  }
}

export const MatchPaymentBankTransaction = new JobManager<MatchPaymentBankTransactionQueueData>(
  'match payment bank transactions',
  process,
  20,
);
