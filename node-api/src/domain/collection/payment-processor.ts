import { ExternalTransactionProcessor, ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { dogstatsd } from '../../lib/datadog-statsd';
import { PaymentError, PaymentProcessorError } from '../../lib/error';
import { ExternalPayment, ExternalPaymentCreator, PaymentLikeObject } from '../../typings';
import { Moment } from 'moment';
import { checkTransactionStatusUnknown } from '../../lib/payment-provider';
import { publishPaymentDeleteEvent, publishPaymentUpdateEvent } from '../payment/loomis-migration';

export async function saveUpdatedProcessorStatus(
  payment: PaymentLikeObject,
  err: PaymentProcessorError | Error,
  reason: string,
): Promise<void | ExternalTransactionStatus> {
  if (err instanceof PaymentError) {
    // Required for errors that occur before charging such as validations for subscription and advance collection
    await payment.update({ status: ExternalTransactionStatus.Canceled });
    await payment.destroy();
    dogstatsd.increment(`${reason}.payment_cancelled`);
    return;
  } else if (!(err instanceof PaymentProcessorError)) {
    dogstatsd.increment(`${reason}.unknown_error_encountered_during_payment`);
    // Keep the status PENDING and allow this to be handled by eventual consistency with job processes
    return ExternalTransactionStatus.Pending;
  } else if (checkTransactionStatusUnknown(err)) {
    dogstatsd.increment(`${reason}.unknown`);
    const update = {
      status: ExternalTransactionStatus.Unknown,
      externalProcessor: err.processor as ExternalTransactionProcessor,
    };
    await payment.update(update);
    await publishPaymentUpdateEvent({ legacyId: payment.id, ...update });
    return;
  }

  dogstatsd.increment(`${reason}.payment_cancelled`);
  await payment.update({ status: ExternalTransactionStatus.Canceled });
  await payment.destroy();
  await publishPaymentDeleteEvent(payment.id, ExternalTransactionStatus.Canceled);
}

export async function attemptChargeAndRecordProcessorError(
  charge: ExternalPaymentCreator,
  amount: number,
  payment: PaymentLikeObject,
  reason: string,
  time?: Moment,
): Promise<ExternalPayment> {
  try {
    return await charge(amount, payment, time);
  } catch (ex) {
    // NOTE: this is to prevent subscri ptions that have neither a BankAccountId or PaymentMethodId
    if (ex.extraPaymentData && payment) {
      const { paymentMethodId, bankAccountId } = ex.extraPaymentData as {
        paymentMethodId?: number;
        bankAccountId?: number;
      };
      if (paymentMethodId && payment.paymentMethodId == null) {
        await payment.update({ paymentMethodId });
        await publishPaymentUpdateEvent({ legacyId: payment.id, paymentMethodId });
      } else if (bankAccountId && payment.bankAccountId == null) {
        await payment.update({ bankAccountId });
        await publishPaymentUpdateEvent({ legacyId: payment.id, bankAccountId });
      }
    }

    const status = await saveUpdatedProcessorStatus(payment, ex, reason);
    if (
      status !== ExternalTransactionStatus.Unknown &&
      status !== ExternalTransactionStatus.Pending
    ) {
      throw ex;
    }
  }
}
