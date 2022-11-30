import {
  PaymentProcessor,
  PaymentProviderTransactionStatus,
  SynapsepayTransactionStatusId,
  PaymentProviderTransaction,
  PaymentGateway,
  CreateTransactionOptions,
  FetchTransactionOptions,
} from '../../../typings';
import { TransactionJSON } from 'synapsepay';
import { ResponseError } from 'superagent';
import { isResponseError } from '../index';

export function formatCreateTransactionError(
  error: any,
  options: CreateTransactionOptions,
): PaymentProviderTransaction {
  const { type, referenceId, amount } = options;
  const responseCode = error.status || null;
  let status;

  // Default to PENDING to avoid double charging a user
  switch (responseCode) {
    case 400:
      status = PaymentProviderTransactionStatus.InvalidRequest;
      break;
    case 404:
      status = PaymentProviderTransactionStatus.NotFound;
      break;
    default:
      status = PaymentProviderTransactionStatus.Pending;
      break;
  }

  return {
    type,
    referenceId,
    externalId: null,
    outcome: null,
    amount,
    gateway: PaymentGateway.Synapsepay,
    processor: PaymentProcessor.Synapsepay,
    raw: error,
    reversalStatus: null,
    status,
  };
}

export function formatFetchTransactionError(
  error: ResponseError,
  options: FetchTransactionOptions,
): PaymentProviderTransaction {
  const { type, referenceId, externalId } = options;
  let responseCode;
  if (isResponseError(error)) {
    responseCode = error.status;
  }
  let status;

  switch (responseCode) {
    case 400:
      status = PaymentProviderTransactionStatus.InvalidRequest;
      break;
    case 404:
      status = PaymentProviderTransactionStatus.NotFound;
      break;
    default:
      status = PaymentProviderTransactionStatus.NetworkError;
      break;
  }

  return {
    type,
    externalId,
    referenceId,
    amount: null,
    gateway: PaymentGateway.Synapsepay,
    outcome: null,
    processor: PaymentProcessor.Synapsepay,
    raw: error,
    reversalStatus: null,
    status,
  };
}

export function formatTransactionStatus(statusId: string): PaymentProviderTransactionStatus {
  switch (statusId) {
    case SynapsepayTransactionStatusId.Settled:
      return PaymentProviderTransactionStatus.Completed;

    case SynapsepayTransactionStatusId.Canceled:
      return PaymentProviderTransactionStatus.Canceled;

    case SynapsepayTransactionStatusId.Returned:
      return PaymentProviderTransactionStatus.Returned;

    case SynapsepayTransactionStatusId.QueuedBySynapse:
    case SynapsepayTransactionStatusId.QueuedByReceiver:
    case SynapsepayTransactionStatusId.Created:
    case SynapsepayTransactionStatusId.ProcessingDebit:
    case SynapsepayTransactionStatusId.ProcessingCredit:
    default:
      return PaymentProviderTransactionStatus.Pending;
  }
}

export function formatOutcome(note: string): { code: string; message: string } {
  let code;
  const result = note.match(/([QCR]\d\d)\S*/);
  if (result) {
    code = result[0];
  }

  return {
    code,
    message: note,
  };
}

export function formatTransactionResponse(response: TransactionJSON): PaymentProviderTransaction {
  const {
    _id: externalId,
    amount: { amount },
    extra: { supp_id: referenceId },
    recent_status: { status_id: statusId, note },
  } = response;

  return {
    externalId,
    referenceId: referenceId || null,
    amount,
    gateway: PaymentGateway.Synapsepay,
    outcome: formatOutcome(note),
    processor: PaymentProcessor.Synapsepay,
    raw: response,
    reversalStatus: null,
    status: formatTransactionStatus(statusId),
  };
}
