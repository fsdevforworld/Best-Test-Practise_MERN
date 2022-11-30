import { isNil } from 'lodash';
import { PaymentProviderTransactionType } from '@dave-inc/loomis-client';
import { ExternalTransactionProcessor, ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { paymentUpdateEvent } from '../event';
import { IPaymentUpdateEventData, IPaymentUpdateMessage } from '../../typings';
import logger from '../../lib/logger';

// We could have just used the sequelize model Payment, but that would create a coupling we don't need
type PaymentMessage = {
  id: number;
  advanceId?: number;
  userId: number;
  amount: number;
  referenceId: string;
  externalId: string;
  status: ExternalTransactionStatus;
  externalProcessor: ExternalTransactionProcessor;
  paymentMethodId: number | null;
  bankAccountId: number | null;
  bankTransactionUuid?: string | null;
};

export async function publishPaymentCreationEvent(
  type: PaymentProviderTransactionType,
  payment?: PaymentMessage,
): Promise<void> {
  if (isNil(payment)) {
    return null;
  }

  const message = paymentToEvent(type, payment);
  if (message !== null) {
    try {
      await paymentUpdateEvent.publish(message);
    } catch (error) {
      logger.warn('Failed to publish payment event', { error, paymentId: payment?.id });
    }
  }
}

export async function publishPaymentUpdateEvent(message: IPaymentUpdateMessage): Promise<void> {
  try {
    await paymentUpdateEvent.publish({ operation: 'update', payment: message });
  } catch (error) {
    logger.warn('Failed to publish payment update event', { error, paymentId: message.legacyId });
  }
}

export async function publishPaymentDeleteEvent(
  paymentId: number,
  status?: ExternalTransactionStatus,
): Promise<void> {
  try {
    await paymentUpdateEvent.publish({
      operation: 'delete',
      payment: { legacyId: paymentId, status },
    });
  } catch (error) {
    logger.warn('Failed to publish payment update event', { error, paymentId });
  }
}

function paymentToEvent(
  type: PaymentProviderTransactionType,
  payment: PaymentMessage,
): IPaymentUpdateEventData | null {
  let paymentMethod: { paymentMethodId: number } | { bankAccountId: number };
  if (!isNil(payment.paymentMethodId)) {
    paymentMethod = { paymentMethodId: payment.paymentMethodId };
  } else if (!isNil(payment.bankAccountId)) {
    paymentMethod = { bankAccountId: payment.bankAccountId };
  } else {
    logger.warn(`Payment ${payment.id} has neither a payment method or bank account`);
    return null;
  }
  return {
    operation: 'create',
    payment: {
      legacyId: payment.id,
      paymentMethodId: payment.paymentMethodId,
      type,
      owningEntityId: !isNil(payment.advanceId)
        ? `advance-${payment.advanceId}`
        : `subscription-${payment.userId}`,
      bankTransactionId: payment.bankTransactionUuid ?? null,
      userId: payment.userId,
      amount: payment.amount,
      referenceId: payment.referenceId,
      externalId: payment.externalId,
      status: payment.status,
      externalProcessor: payment.externalProcessor,
      ...paymentMethod,
    },
  };
}
