import { pick } from 'lodash';

import { dogstatsd } from '../../lib/datadog-statsd';
import logger from '../../lib/logger';
import { AuditLog, SubscriptionPayment, TransactionSettlement } from '../../models';
import {
  TransactionSettlementSource,
  PaymentProviderTransaction,
  PaymentProviderTransactionType,
  PaymentProviderTransactionStatus,
} from '../../typings';

import {
  buildSubscriptionPaymentProviders,
  refreshExternalTransaction,
  RefreshExternalTransactionResponse,
} from '../../domain/fetch-external-transaction';

import { UpdatePendingSubscriptionPaymentPayload } from '../data';

const DATADOG_METRIC_LABEL = 'update_pending_subscription_payments';
export async function refreshSubscriptionPayment(subscriptionPayment: SubscriptionPayment) {
  const { id, userId } = subscriptionPayment;

  const settlement: TransactionSettlement = await TransactionSettlement.findOne({
    attributes: ['externalId', 'processor', 'status', 'updated'],
    where: {
      sourceId: id,
      sourceType: TransactionSettlementSource.SubscriptionPayment,
    },
  });

  let updateParams;
  const isFreshTransactionSettlement = settlement?.updated > subscriptionPayment.updated;

  if (isFreshTransactionSettlement) {
    dogstatsd.increment(`${DATADOG_METRIC_LABEL}.processed_payment`, {
      processed_by: 'transaction_table',
    });
    const { externalId, processor, status, updated } = settlement;
    updateParams = { externalId, externalProcessor: processor, status, updated };
    dogstatsd.increment(`${DATADOG_METRIC_LABEL}.using_transaction_settlement`);
  } else {
    const subscriptionPaymentProviders = await buildSubscriptionPaymentProviders(
      subscriptionPayment,
    );

    if (!subscriptionPaymentProviders.length) {
      dogstatsd.increment(`${DATADOG_METRIC_LABEL}.gateway_not_supported`);

      logger.warn(
        'Failed to fetch a subscription payment record because there are no supported gateways',
      );

      return;
    }

    const { updates, fetchedTransactions, success } = await refreshExternalTransaction(
      subscriptionPaymentProviders,
      {
        bankAccountId: subscriptionPayment.bankAccountId,
        externalId: subscriptionPayment.externalId,
        referenceId: subscriptionPayment.referenceId,
        status: subscriptionPayment.status,
        type: PaymentProviderTransactionType.SubscriptionPayment,
        userId,
      },
    );

    const { processor: externalProcessor } = updates;
    updateParams = { ...updates, externalProcessor };

    if (Boolean(updates) && !success) {
      logFailedRefresh(userId, fetchedTransactions, { updates, fetchedTransactions });
    }
  }
  await SubscriptionPayment.update(updateParams, { where: { id: subscriptionPayment.id } });
}

function logFailedRefresh(
  userId: number,
  failedTransactions: PaymentProviderTransaction[],
  { updates, fetchedTransactions }: RefreshExternalTransactionResponse,
) {
  logger.warn('Failed to fetch a subscription payment record', {
    updates,
    fetchedTransactions: fetchedTransactions.map(t =>
      pick(t, ['externalId', 'referenceId', 'status']),
    ),
  });

  dogstatsd.increment(`${DATADOG_METRIC_LABEL}.fetch_error`);

  if (failedTransactions.some(ft => ft.status !== PaymentProviderTransactionStatus.NotFound)) {
    return AuditLog.create({
      userId,
      type: 'UPDATE_SUBSCRIPTION_PAYMENT_STATUS',
      successful: false,
      extra: {
        failedTransactions: fetchedTransactions,
      },
    });
  }
}

export async function updatePendingSubscriptionPayment(
  data: UpdatePendingSubscriptionPaymentPayload,
) {
  const { subscriptionPaymentId: id } = data;

  const subscriptionPayment = await SubscriptionPayment.findOne({
    where: { id },
  });

  if (!subscriptionPayment) {
    dogstatsd.increment(`${DATADOG_METRIC_LABEL}.payment_row_not_found`);
    return;
  }

  await refreshSubscriptionPayment(subscriptionPayment);
}
