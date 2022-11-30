import { PaymentProviderTransaction } from '@dave-inc/loomis-client';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { pick } from 'lodash';
import logger from '../../lib/logger';
import { Payment } from '../../models';
import { dogstatsd } from '../../lib/datadog-statsd';
import {
  getPossiblePaymentProviders,
  updatePayment,
  PaymentUpdateTrigger,
} from '../../domain/payment';
import { mapPaymentProcessor } from '../../domain/payment-provider';
import {
  refreshExternalTransaction,
  RefreshExternalTransactionUpdates,
} from '../../domain/fetch-external-transaction';
import { PaymentProviderTransactionType, TransactionSettlementSource } from '../../typings';
import { UpdatePaymentStatusQueueData } from '../data';

export class UpdatePaymentStatusError extends Error {}

export async function updatePaymentStatus({
  paymentId,
}: UpdatePaymentStatusQueueData): Promise<void> {
  dogstatsd.increment('update_payment_status.job_triggered');

  const payment = await Payment.findOne({
    where: { id: paymentId },
  });

  if (!payment) {
    dogstatsd.increment('update_payment_status.payment_not_found');
    return;
  }

  const { referenceId } = payment;

  if (!referenceId) {
    return;
  }

  const paymentProviders = await getPossiblePaymentProviders(payment);
  const previousStatus = payment.status;

  const { updates, fetchedTransactions, shouldRetry, success } = await refreshExternalTransaction(
    paymentProviders,
    {
      externalId: payment.externalId,
      referenceId,
      status: payment.status,
      advanceId: payment.advanceId,
      transactionSettlementSource: {
        sourceId: paymentId,
        sourceType: TransactionSettlementSource.Payment,
      },
      type: PaymentProviderTransactionType.AdvancePayment,
      created: payment.created,
    },
  );

  const isValidTransition = validateStatusTransition(payment, updates, fetchedTransactions);

  if (isValidTransition) {
    /**
     * updatePayment takes care of several edge cases, such as failure
     * states, as well. the code that comes after is to add addtional
     * metrics/monitoring specific to this job
     */
    await updatePayment(
      payment,
      {
        status: updates.status,
        externalId: updates.externalId,
        externalProcessor: updates.processor ? mapPaymentProcessor(updates.processor) : undefined,
      },
      true,
      PaymentUpdateTrigger.UpdatePendingPaymentJob,
    );
  }

  if (success) {
    dogstatsd.increment('update_payment_status.payment_successfully_updated', 1, [
      `processor:${updates.processor}`,
      `previous_status:${previousStatus}`,
      `status:${updates.status}`,
    ]);

    return;
  }
  dogstatsd.increment('update_payment_status.payment_not_updated', 1, [
    `processor:${updates.processor}`,
    `status:${updates.status}`,
  ]);

  logger.info('Failed to update payment', {
    paymentId: payment.id,
    paymentStatus: payment.status,
    processorResponses: fetchedTransactions.map(t =>
      pick(t, ['externalId', 'referenceId', 'status']),
    ),
  });

  if (shouldRetry) {
    throw new Error(`Error processing paymentId: ${payment.id}.  Should retry.`);
  }
}

function validateStatusTransition(
  payment: Payment,
  updates: RefreshExternalTransactionUpdates,
  fetchedTransactions: PaymentProviderTransaction[],
) {
  if (
    payment.status === ExternalTransactionStatus.Completed &&
    (updates.status === ExternalTransactionStatus.Canceled ||
      updates.status === ExternalTransactionStatus.Unknown)
  ) {
    logger.warn('Attempting to update completed payment to canceled or unknown', {
      paymentId: payment.id,
      paymentStatus: payment.status,
      failedTransitionStatus: updates.status,
      processorResponses: fetchedTransactions.map(t =>
        pick(t, ['externalId', 'referenceId', 'status']),
      ),
    });

    dogstatsd.increment('update_payment_status.illegal_status_transition', 1, [
      `processor:${updates.processor}`,
      `existingStatus:${payment.status}`,
      `failedTransitionStatus:${updates.status}`,
    ]);

    return false;
  }

  return true;
}
