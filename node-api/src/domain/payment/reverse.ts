import {
  getPaymentGateway as getGateway,
  PaymentProviderSuccessStatus,
  PaymentProviderTransaction,
  PaymentProviderTransactionStatus,
  PaymentProviderTransactionType,
} from '@dave-inc/loomis-client';
import { NotFoundError, PaymentProcessorError } from '../../lib/error';

import { Advance, AuditLog, Payment, PaymentMethod, PaymentReversal } from '../../models';

import { buildReverseRequest } from '../fetch-external-transaction';
import { extractFromExternalTransaction } from '../payment-provider';

import { getPossiblePaymentProviders } from './utils';

import { updatePayment } from '.';

export async function reversePayment(
  payment: Payment,
  { reversedByUserId, note }: { reversedByUserId?: number; note?: string } = {},
) {
  let transaction: PaymentProviderTransaction;

  await payment.reload({
    include: [
      { model: PaymentMethod, paranoid: false },
      { model: Advance, paranoid: false },
    ],
    paranoid: false,
  });

  const paymentProviders = await getPossiblePaymentProviders(payment);
  let error;
  for (const provider of paymentProviders) {
    const { gateway, sourceId, processor } = provider;
    const gatewayClient = getGateway(gateway);
    const reversalRequest = await buildReverseRequest(
      payment,
      processor,
      PaymentProviderTransactionType.AdvancePayment,
      sourceId,
    );

    transaction = await gatewayClient.reverseTransaction(reversalRequest);

    if (transaction.reversalStatus in PaymentProviderSuccessStatus) {
      const paymentReversal = await PaymentReversal.create({
        status: transaction.reversalStatus,
        extra: { transaction },
        paymentId: payment.id,
        amount: payment.amount,
        reversedByUserId,
        note,
      });

      await updatePayment(payment, extractFromExternalTransaction(transaction));

      return { payment, paymentReversal };
    }

    if (transaction.status === PaymentProviderTransactionStatus.NotFound) {
      error = new NotFoundError('Could not find external transaction to refund for payment', {
        data: {
          paymentId: payment.id,
          searches: paymentProviders,
        },
      });
    } else {
      error = new PaymentProcessorError('Failed reversing transaction', transaction.raw as string);
    }

    const ex = transaction.raw;
    await AuditLog.create({
      message: `Payment id ${payment.id} reversal has failed`,
      extra: { ex, paymentId: payment.id },
      userId: payment.userId,
      type: 'REVERSE_PAYMENT',
      successful: false,
    });
  }

  // If a successful reversal was not possible through any network, record the failure
  await PaymentReversal.create({
    status: transaction.reversalStatus,
    extra: { transaction },
    paymentId: payment.id,
    amount: payment.amount,
    reversedByUserId,
    note,
  });

  throw error;
}
