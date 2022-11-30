import {
  PaymentProviderTransactionType,
  PaymentProcessor,
  PaymentGateway,
  PaymentProviderTransaction,
  PaymentProviderTransactionStatus,
  ReversalStatus,
} from '../../../typings';
import ErrorHelper from '@dave-inc/error-helper';
import * as openapi from '@dave-inc/banking-internal-api-client';
import { get } from 'lodash';
import logger from '../../../lib/logger';

export function formatTransaction(
  txn: openapi.IInternalApiPaymentProviderTransaction,
  referenceId: string,
  type: PaymentProviderTransactionType,
): PaymentProviderTransaction {
  return {
    externalId: txn.id,
    referenceId,
    amount: Math.abs(txn.amount),
    type,
    status: extractStatus(txn.status),
    processor: PaymentProcessor.BankOfDave,
    gateway: PaymentGateway.BankOfDave,
    reversalStatus: null,
  };
}

export function formatReversal(
  txn: openapi.IInternalApiPaymentProviderTransaction,
  referenceId: string,
  type: PaymentProviderTransactionType,
  originalTransactionStatus?: PaymentProviderTransactionStatus,
): PaymentProviderTransaction {
  const ppt = formatTransaction(txn, referenceId, type);
  ppt.reversalStatus = getReversalStatus(ppt.status);
  if (originalTransactionStatus) {
    ppt.status = originalTransactionStatus;
  }
  return ppt;
}

export function formatResponseError(
  error: Error,
  {
    amount,
    externalId,
    referenceId,
    type,
  }: {
    amount?: number;
    externalId?: string;
    referenceId?: string;
    type: PaymentProviderTransactionType;
  },
): PaymentProviderTransaction {
  const errorCode: string = get(error, 'response.data.customCode', 'Unknown');
  const status = extractErrorStatus(errorCode);

  return {
    type,
    referenceId: referenceId || null,
    externalId: externalId || null,
    outcome: null,
    amount: Math.abs(amount) || null,
    gateway: PaymentGateway.BankOfDave,
    processor: PaymentProcessor.BankOfDave,
    raw: ErrorHelper.logFormat(error),
    reversalStatus: null,
    status,
  };
}

function extractStatus(status: openapi.TransactionStatus): PaymentProviderTransactionStatus {
  switch (status) {
    case openapi.TransactionStatus.Canceled:
      return PaymentProviderTransactionStatus.Canceled;
    case openapi.TransactionStatus.Pending:
      return PaymentProviderTransactionStatus.Pending;
    case openapi.TransactionStatus.Returned:
      return PaymentProviderTransactionStatus.Returned;
    case openapi.TransactionStatus.Settled:
      return PaymentProviderTransactionStatus.Completed;
    default:
      logger.error('Invalid TransactionStatus', { status });
      return PaymentProviderTransactionStatus.Pending;
  }
}

function getReversalStatus(status: PaymentProviderTransactionStatus): ReversalStatus {
  switch (status) {
    case PaymentProviderTransactionStatus.Canceled:
    case PaymentProviderTransactionStatus.Returned:
      return ReversalStatus.Failed;
    case PaymentProviderTransactionStatus.Pending:
      return ReversalStatus.Pending;
    case PaymentProviderTransactionStatus.Completed:
      return ReversalStatus.Completed;
    default:
      logger.error('Invalid PaymentProviderTransactionStatus', { status });
      return ReversalStatus.Pending;
  }
}

function extractErrorStatus(errorCode: string): PaymentProviderTransactionStatus {
  switch (errorCode) {
    case openapi.INotFoundErrorApiResponseCustomCodeEnum.NotFound:
      return PaymentProviderTransactionStatus.NotFound;
    case openapi.IUnauthorizedErrorResponseCustomCodeEnum.Unauthorized:
    case openapi.IValidationErrorResponseCustomCodeEnum.ValidationError:
      return PaymentProviderTransactionStatus.InvalidRequest;

    default:
      return PaymentProviderTransactionStatus.Pending;
  }
}
