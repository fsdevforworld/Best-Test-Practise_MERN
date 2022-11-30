import { compact, isEqual, isNil, takeRight } from 'lodash';
import { moment } from '@dave-inc/time-lib';

import { ExternalTransactionProcessor, ExternalTransactionStatus } from '@dave-inc/wire-typings';

import { AuditLog, Payment } from '../../models';
import { completedOrPendingStatuses } from '../../models/payment';

import { broadcastPaymentChangedTask } from '../../jobs/data';

import * as CollectionDomain from '../collection';

import * as Notification from '../notifications';

import { PaymentUpdateTrigger } from './utils';
import logger from '../../lib/logger';
import { publishPaymentUpdateEvent } from './loomis-migration';

export async function updatePayment(
  payment: Payment,
  {
    status,
    externalId,
    externalProcessor,
    webhookData,
  }: {
    status: ExternalTransactionStatus;
    externalId?: string;
    externalProcessor?: ExternalTransactionProcessor;
    webhookData?: Record<string, unknown>;
  },
  shouldNotifyUser: boolean = false,
  trigger: PaymentUpdateTrigger = PaymentUpdateTrigger.DashboardRequest,
) {
  const { status: previousStatus, webhookData: allWebhookData } = payment;
  const previousWebhookData = allWebhookData && allWebhookData[allWebhookData.length - 1];
  const receivedNewWebhookData = !isEqual(previousWebhookData, webhookData);

  let updatedWebhookData: any = allWebhookData;
  if (receivedNewWebhookData) {
    if (allWebhookData?.length > 100) {
      const webhookDataString = JSON.stringify(allWebhookData);
      logger.warn('Long webhook update data, truncating to 100 entries', {
        numEntries: (allWebhookData ?? []).length,
        paymentId: payment.id,
        textLength: webhookDataString.length,
      });
    }

    // keep max 100 webhook entries
    updatedWebhookData = compact([].concat(takeRight(allWebhookData, 99), webhookData));
  }

  const shouldRemoveSoftDelete =
    completedOrPendingStatuses.includes(status) && !isNil(payment.deleted);

  if (shouldRemoveSoftDelete) {
    await payment.restore();
  }

  const paymentUpdate = {
    status,
    externalId,
    externalProcessor,
    webhookData: updatedWebhookData,
  };
  await payment.update(paymentUpdate);

  await publishPaymentUpdateEvent({ legacyId: payment.id, ...paymentUpdate });

  const advance = await payment.getAdvance({ paranoid: false });
  if (advance?.deletedAt) {
    logger.warn('Payment updated for deleted advance', {
      advanceId: advance.id,
      paymentId: payment.id,
      newStatus: status,
      previousStatus,
    });
  } else if (!isNil(advance)) {
    await CollectionDomain.updateOutstanding(advance);
  }

  const { Returned, Canceled } = ExternalTransactionStatus;

  const isFailedStatus = status === Returned || status === Canceled;

  const receivedNewStatus = previousStatus !== status;
  if (receivedNewStatus && isFailedStatus) {
    const onPaymentUpdates: any = [
      broadcastPaymentChangedTask({ paymentId: payment.id, time: moment().format() }),
    ];

    if (status === Returned) {
      await CollectionDomain.checkReturnedPaymentForMultiAdvances(payment);
    }

    if (shouldNotifyUser) {
      onPaymentUpdates.push(Notification.sendAdvancePaymentFailed(payment));
    }

    await Promise.all(onPaymentUpdates);
  }

  if (receivedNewStatus) {
    await AuditLog.create({
      message: `Payment id ${payment.id} updated via ${trigger}`,
      extra: { previousStatus, newStatus: status },
      userId: payment.userId,
      eventUuid: payment.id,
      type: 'PAYMENT_STATUS_UPDATED',
      successful: false,
    });
  }

  return payment;
}
