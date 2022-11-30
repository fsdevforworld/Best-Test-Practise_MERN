import { ExternalTransactionProcessor, ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { dogstatsd } from '../../lib/datadog-statsd';
import { ExternalTransactionError, InvalidParametersError } from '../../lib/error';
import {
  IPaymentGateway,
  PaymentGateway,
  PaymentProcessor,
  PaymentProviderTransaction,
  PaymentProviderTransactionStatus,
} from '../../typings';
import BankOfDaveInternalApiGateway from './bank-of-dave-internal-api/gateway';
import SynapsepayGateway from './synapsepay/gateway';
import TabapayGateway from './tabapay/gateway';
import TabapayACHGateway from './tabapay-ach/gateway';

export function getGateway(gateway: PaymentGateway): IPaymentGateway {
  switch (gateway) {
    case PaymentGateway.Synapsepay:
      return SynapsepayGateway;
    case PaymentGateway.Tabapay:
      return TabapayGateway;
    case PaymentGateway.BankOfDave:
      return BankOfDaveInternalApiGateway;
    case PaymentGateway.TabapayACH:
      return TabapayACHGateway;
    default:
      throw new InvalidParametersError(`${gateway} is not a valid gateway`);
  }
}

export function mapTransactionStatus(
  status: PaymentProviderTransactionStatus,
): ExternalTransactionStatus {
  const statusMap: { [key: string]: ExternalTransactionStatus } = {
    [PaymentProviderTransactionStatus.Canceled]: ExternalTransactionStatus.Canceled,
    [PaymentProviderTransactionStatus.Completed]: ExternalTransactionStatus.Completed,
    [PaymentProviderTransactionStatus.Failed]: ExternalTransactionStatus.Canceled,
    [PaymentProviderTransactionStatus.Pending]: ExternalTransactionStatus.Pending,
    [PaymentProviderTransactionStatus.Returned]: ExternalTransactionStatus.Returned,
  };
  const failureCases = [PaymentProviderTransactionStatus.InvalidRequest];

  if (failureCases.includes(status)) {
    dogstatsd.increment('payment_provider.failed_transaction_status', { status });
    return ExternalTransactionStatus.Canceled;
  }

  const transactionStatus = statusMap[status];

  if (!transactionStatus) {
    dogstatsd.increment('payment_provider.invalid_transaction_status', { status });
    throw new InvalidParametersError(`Status of ${status} cannot be mapped to an External Status`);
  }

  return transactionStatus;
}

export function extractFromExternalTransaction(
  transaction: PaymentProviderTransaction,
): {
  externalId: string;
  status: ExternalTransactionStatus;
  externalProcessor: ExternalTransactionProcessor;
} {
  const { externalId, status, processor } = transaction;
  try {
    return {
      externalId,
      status: mapTransactionStatus(status),
      externalProcessor: mapPaymentProcessor(processor),
    };
  } catch (error) {
    throw new ExternalTransactionError(
      'Cannot map payment provider transaction to dave transaction',
      { transaction, originalError: error, failingService: processor },
    );
  }
}

export function mapPaymentProcessor(processor: PaymentProcessor): ExternalTransactionProcessor {
  const paymentProcessorMap = {
    [PaymentProcessor.Tabapay]: ExternalTransactionProcessor.Tabapay,
    [PaymentProcessor.TabapayACH]: ExternalTransactionProcessor.TabapayACH,
    [PaymentProcessor.Synapsepay]: ExternalTransactionProcessor.Synapsepay,
    [PaymentProcessor.Blastpay]: ExternalTransactionProcessor.Blastpay,
    [PaymentProcessor.Payfi]: ExternalTransactionProcessor.Payfi,
    [PaymentProcessor.BankOfDave]: ExternalTransactionProcessor.BankOfDave,
    [PaymentProcessor.Stripe]: ExternalTransactionProcessor.Stripe,
  };

  const externalTransactionProcessor = paymentProcessorMap[processor];

  if (!externalTransactionProcessor) {
    throw new InvalidParametersError(
      `Processor type of ${processor} cannot be mapped to an External Processor`,
    );
  }

  return externalTransactionProcessor;
}

export function isResponseError(resp: any): boolean {
  if (
    !resp ||
    !resp.response ||
    typeof resp.response !== 'object' ||
    Object.keys(resp.response).length === 0
  ) {
    return false;
  }

  const err = resp.response.error;
  if (!err || typeof err !== 'object' || Object.keys(err).length === 0) {
    return false;
  }
  if (!err.status || typeof err.status !== 'number') {
    return false;
  }
  if (!err.text || typeof err.text !== 'string') {
    return false;
  }
  if (!err.path || typeof err.path !== 'string') {
    return false;
  }

  return true;
}
