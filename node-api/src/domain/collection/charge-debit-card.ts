import loomisClient, { PaymentMethod } from '@dave-inc/loomis-client';
import {
  Advance,
  AuditLog,
  PaymentMethod as PaymentMethodModel,
  SubscriptionPayment,
} from '../../models';
import {
  ChargeableMethod,
  ExternalPayment,
  ExternalPaymentCreator,
  PaymentLikeObject,
  PaymentMethodRetrieval,
} from '../../typings';
import { ExternalTransactionProcessor, ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { PaymentError, PaymentProcessorError } from '../../lib/error';
import * as Tabapay from '../../lib/tabapay';
import { checkTransactionStatusUnknown } from '../../lib/payment-provider';
import { Moment } from 'moment';

export enum PaymentType {
  ADVANCE,
  MICRO_DEPOSIT,
  SUBSCRIPTION,
}

export function createDebitCardAdvanceCharge(
  paymentMethod: PaymentMethod,
  advance: Advance,
): ExternalPaymentCreator {
  const chargeFn = (amount: number, paymentObject: PaymentLikeObject, time?: Moment) => {
    const correspondingId =
      advance.disbursementProcessor === ExternalTransactionProcessor.Tabapay
        ? advance.externalId
        : undefined;
    return charge(paymentMethod, PaymentType.ADVANCE, amount, paymentObject, { correspondingId });
  };

  return chargeFn;
}

export function createDebitCardSubscriptionCharge(
  paymentMethod: PaymentMethod,
): ExternalPaymentCreator {
  const chargeFn: ExternalPaymentCreator = async (
    amount: number,
    paymentObject: SubscriptionPayment,
    time?: Moment,
    {
      correspondingId: correspondingId = undefined,
      processor: processor = ExternalTransactionProcessor.Tabapay,
    } = {},
  ) => {
    try {
      return await charge(paymentMethod, PaymentType.SUBSCRIPTION, amount, paymentObject, {
        correspondingId,
        processor,
      });
    } catch (ex) {
      // NOTE: Until we refactor, this will solve the issue of not knowing what type of charge threw an error
      ex.extraPaymentData = {
        paymentMethodId: paymentMethod.id,
      };
      throw ex;
    }
  };

  return chargeFn;
}

export async function charge(
  paymentMethod: PaymentMethod,
  paymentType: PaymentType,
  amount: number,
  paymentObject: PaymentLikeObject,
  {
    correspondingId: correspondingId = undefined,
    processor: processor = ExternalTransactionProcessor.Tabapay,
  } = {},
): Promise<ExternalPayment> {
  const { invalid } = paymentMethod;

  if (invalid) {
    throw new PaymentError('Debit card is not valid');
  }

  let externalResponse: PaymentMethodRetrieval;
  await paymentObject.update({
    externalProcessor: processor,
    paymentMethodId: paymentMethod.id,
    bankAccountId: null,
  });
  if (paymentMethod.tabapayId) {
    const isSubscription = paymentType === PaymentType.SUBSCRIPTION;
    externalResponse = await Tabapay.retrieve(
      paymentObject.referenceId,
      paymentMethod.tabapayId,
      amount,
      isSubscription,
      paymentMethod.bin,
      paymentMethod.risepayId ? undefined : correspondingId,
    ).catch(ex => handleChargeFailure(ex, paymentMethod, processor));
  } else {
    throw new PaymentError('Debit card unsupported', {
      data: {
        msg: 'Card does not have a tabapay id',
        paymentMethod,
      },
    });
  }

  const { status, id } = externalResponse;

  if (
    status !== ExternalTransactionStatus.Completed &&
    status !== ExternalTransactionStatus.Pending &&
    status !== ExternalTransactionStatus.Unknown
  ) {
    await AuditLog.create({
      userId: paymentMethod.userId,
      type: 'EXTERNAL_PAYMENT',
      message: 'Failed to create external payment',
      successful: false,
      eventUuid: paymentMethod.id,
      extra: {
        type: ChargeableMethod.DebitCard,
        processor,
        externalResponse,
        referenceId: paymentObject.referenceId,
        paymentId: paymentObject.id,
      },
    });

    throw new PaymentError('Failed to process debit card withdrawal');
  }

  let externalPayment: ExternalPayment;
  externalPayment = {
    id,
    type: ChargeableMethod.DebitCard,
    status,
    amount,
    processor,
    chargeable: paymentMethod,
  };

  await AuditLog.create({
    userId: paymentMethod.userId,
    type: 'EXTERNAL_PAYMENT',
    message: 'Completed external payment',
    successful: true,
    eventUuid: paymentMethod.id,
    extra: { payment: externalPayment },
  });

  return externalPayment;
}

async function handleChargeFailure(
  ex: Error,
  paymentMethod: PaymentMethod,
  processor: string,
): Promise<never> {
  if (
    ex instanceof PaymentProcessorError &&
    Tabapay.invalidResponseCodes.includes(ex.processorResponse)
  ) {
    const paymentMethodModel = await PaymentMethodModel.findByPk(paymentMethod.id);
    const loomisResponse = await loomisClient.updatePaymentMethod(paymentMethodModel.id, {
      invalidReasonCode: ex.processorResponse,
    });

    if ('error' in loomisResponse) {
      throw new Error(
        `Loomis gave an error in handleChargeFailure ${loomisResponse.error.message}`,
      );
    }
  }

  await AuditLog.create({
    userId: paymentMethod.userId,
    type: 'EXTERNAL_PAYMENT',
    message: 'Failed to create external payment',
    successful: false,
    eventUuid: paymentMethod.id,
    extra: {
      type: 'debit-card',
      processor,
      err: ex,
    },
  });

  throw ex;
}

export function isInsufficientFundsError(ex: Error): boolean {
  const insufficientFundsErrorCodes = ['51', '116', '216'];
  return (
    ex instanceof PaymentProcessorError &&
    insufficientFundsErrorCodes.includes(ex.processorResponse)
  );
}

export function isUnknownPaymentProcessorError(err: Error): boolean {
  return err instanceof PaymentProcessorError && checkTransactionStatusUnknown(err);
}
