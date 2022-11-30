import logger from '../../../lib/logger';
import {
  StandardResponse,
  PaymentMethod,
  externalStatusToLoomisStatus,
} from '@dave-inc/loomis-client';
import { Payment, SubscriptionPayment } from '../../../models';

function logWarning(functionName: string, logSource: string, error: Error) {
  const logString = `LoomisClient - ${functionName} failed`;
  logger.warn(logString, { error, logSource });
}
export function parseLoomisGetPaymentMethod(
  response: StandardResponse<PaymentMethod>,
  logSource: string,
  loggingOption: string = 'getPaymentMethod',
) {
  if ('error' in response) {
    logWarning(loggingOption, logSource, response.error);

    return null;
  } else {
    return response.data;
  }
}

export function parseLoomisSynapseDisburserBalance(
  response: StandardResponse<number>,
  logSource: string,
) {
  if ('error' in response) {
    logWarning('synapsePayGetDisburserBalance', logSource, response.error);

    return null;
  } else {
    return response.data;
  }
}

export function parseLoomisSynapseMoveFunds(
  response: StandardResponse<boolean>,
  logSource: string,
) {
  if ('error' in response) {
    logWarning('synapsePayMoveFundsFromDisburser', logSource, response.error);

    return null;
  } else {
    return response.data;
  }
}

export function dollarsToCents(dollars: number) {
  return Math.round(dollars * 100);
}

export function centsToDollars(cents: number) {
  return cents / 100;
}

export function serializePaymentForLoomis(payment: Payment | SubscriptionPayment) {
  const isACH = 'isACH' in payment ? payment.isACH : false;
  return {
    legacyPaymentId: payment.id,
    userId: payment.userId,
    bankAccountId: payment.bankAccountId,
    paymentMethodId: payment.paymentMethodId,
    amountInCents: dollarsToCents(payment.amount),
    externalProcessor: payment.externalProcessor,
    externalId: payment.externalId,
    referenceId: payment.referenceId,
    status: externalStatusToLoomisStatus(payment.status),
    isACH,
    created: payment.created.toDate(),
    updated: payment.updated?.toDate(),
    deleted: payment.deleted,
  };
}
