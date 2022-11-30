import {
  CreateTransactionOptions,
  FetchTransactionOptions,
  PaymentGateway,
  PaymentProcessor,
  PaymentProviderTransaction,
  PaymentProviderTransactionStatus,
  ReversalStatus,
  ReverseTransactionOptions,
  TabapayCreateTransactionResponse,
  TabapayNetworkResponseCode,
  TabapayRequestTransactionStatus,
  TabapayRetrieveTransactionResponse,
  TabapayReverseTransactionResponse,
} from '@dave-inc/loomis-client';
import { ResponseError } from 'superagent';
import { isResponseError } from '../index';

function formatReversalStatus(reversal: {
  networkRC?: string;
  networkRC2?: string;
  error?: string;
}): ReversalStatus | null {
  let status: ReversalStatus;
  const { networkRC, networkRC2 } = reversal || {};
  const successfulResponseCodes = ['00', '000'];

  if (successfulResponseCodes.includes(networkRC) || successfulResponseCodes.includes(networkRC2)) {
    status = ReversalStatus.Completed;
  } else {
    status = ReversalStatus.Failed;
  }

  return status || null;
}

function minifyResponseError(error: ResponseError) {
  return {
    name: error.name,
    responseBody: error.response.body,
    message: error.message,
    status: error.status,
  };
}

function formatTransactionStatus(
  status: TabapayRequestTransactionStatus,
  networkRC: string,
  networkRC2?: string,
): PaymentProviderTransactionStatus {
  switch (status) {
    case TabapayRequestTransactionStatus.Completed:
      return PaymentProviderTransactionStatus.Completed;

    case TabapayRequestTransactionStatus.Error:
      if (
        networkRC === TabapayNetworkResponseCode.INOPERATIVE ||
        networkRC2 === TabapayNetworkResponseCode.INOPERATIVE
      ) {
        // Per Tabapay the INOPERATIVE network response code
        // should correspond to a PENDING transaction
        return PaymentProviderTransactionStatus.Pending;
      } else {
        return PaymentProviderTransactionStatus.Canceled;
      }

    case TabapayRequestTransactionStatus.Failed:
      return PaymentProviderTransactionStatus.Canceled;

    case TabapayRequestTransactionStatus.Created:
    case TabapayRequestTransactionStatus.Pending:
    case TabapayRequestTransactionStatus.Unknown:
    default:
      return PaymentProviderTransactionStatus.Pending;
  }
}

function errorCodeToStatus(responseCode: number) {
  let status;
  switch (responseCode) {
    case 400:
    case 409:
      status = PaymentProviderTransactionStatus.InvalidRequest;
      break;
    case 404:
      status = PaymentProviderTransactionStatus.NotFound;
      break;
    default:
      status = PaymentProviderTransactionStatus.Pending;
      break;
  }
  return status;
}

export function formatCreateTransactionError(
  error: ResponseError,
  options: CreateTransactionOptions,
  transactionType?: { isAchTransaction: boolean },
): PaymentProviderTransaction {
  const { type, referenceId, amount } = options;
  const { isAchTransaction } = transactionType || {};

  let responseCode;
  if (isResponseError(error)) {
    responseCode = error.status;
    error = minifyResponseError(error);
  }

  return {
    type,
    referenceId,
    externalId: null,
    outcome: null,
    amount,
    gateway: isAchTransaction ? PaymentGateway.TabapayACH : PaymentGateway.Tabapay,
    processor: isAchTransaction ? PaymentProcessor.TabapayACH : PaymentProcessor.Tabapay,
    raw: error,
    reversalStatus: null,
    status: errorCodeToStatus(responseCode),
  };
}

export function formatFetchTransactionError(
  error: ResponseError,
  options: FetchTransactionOptions,
  transactionType?: { isAchTransaction: boolean },
): PaymentProviderTransaction {
  const { referenceId, externalId, type } = options;
  const { isAchTransaction } = transactionType || {};

  let responseCode;
  if (isResponseError(error)) {
    responseCode = error.status;
    error = minifyResponseError(error);
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
    gateway: isAchTransaction ? PaymentGateway.TabapayACH : PaymentGateway.Tabapay,
    outcome: null,
    processor: isAchTransaction ? PaymentProcessor.TabapayACH : PaymentProcessor.Tabapay,
    raw: error,
    reversalStatus: null,
    status,
  };
}

export function formatReverseTransactionError(
  payload: TabapayReverseTransactionResponse,
  { externalId, type }: ReverseTransactionOptions,
  transactionType?: { isAchTransaction: boolean },
): PaymentProviderTransaction {
  const { isAchTransaction } = transactionType || {};

  return {
    type,
    externalId,
    referenceId: null,
    amount: null,
    gateway: isAchTransaction ? PaymentGateway.TabapayACH : PaymentGateway.Tabapay,
    outcome: null,
    processor: isAchTransaction ? PaymentProcessor.TabapayACH : PaymentProcessor.Tabapay,
    raw: payload,
    reversalStatus: ReversalStatus.Failed,
    status: PaymentProviderTransactionStatus.Pending,
  };
}

export function formatReverseTransactionResponse(
  payload: TabapayReverseTransactionResponse,
  { externalId, type }: ReverseTransactionOptions,
  transactionType?: { isAchTransaction: boolean },
): PaymentProviderTransaction {
  const { reversal, status } = payload;
  const { isAchTransaction } = transactionType || {};

  // If the reversal fails, the transaction status should remain COMPLETED
  const { Error, Failed } = TabapayRequestTransactionStatus;
  const reversalFailed = status === Error || status === Failed;
  const transactionStatus = reversalFailed
    ? PaymentProviderTransactionStatus.Completed
    : formatTransactionStatus(status, reversal.networkRC, reversal.networkRC2);

  return {
    type,
    externalId,
    referenceId: null,
    amount: null,
    gateway: isAchTransaction ? PaymentGateway.TabapayACH : PaymentGateway.Tabapay,
    outcome: { code: reversal.networkRC },
    processor: isAchTransaction ? PaymentProcessor.TabapayACH : PaymentProcessor.Tabapay,
    raw: payload,
    reversalStatus: formatReversalStatus(reversal),
    status: transactionStatus,
  };
}

export function formatCreateTransactionResponse(
  payload: TabapayCreateTransactionResponse,
  { referenceId, amount, type }: CreateTransactionOptions,
  transactionType?: { isAchTransaction: boolean },
): PaymentProviderTransaction {
  const { approvalCode, network, networkID, networkRC, status, transactionID } = payload;
  const { isAchTransaction } = transactionType || {};

  return {
    amount,
    externalId: transactionID,
    gateway: isAchTransaction ? PaymentGateway.TabapayACH : PaymentGateway.Tabapay,
    network: {
      approvalCode,
      networkId: networkID,
      settlementNetwork: network,
    },
    outcome: { code: networkRC },
    processor: isAchTransaction ? PaymentProcessor.TabapayACH : PaymentProcessor.Tabapay,
    raw: payload,
    referenceId,
    reversalStatus: null,
    status: formatTransactionStatus(status, networkRC),
    type,
  };
}

export function formatFetchTransactionResponse(
  payload: TabapayRetrieveTransactionResponse,
  { type, referenceId, externalId }: FetchTransactionOptions,
  transactionType?: { isAchTransaction: boolean },
): PaymentProviderTransaction {
  const { amount, networkRC, reversal, status, transactionID } = payload;
  const { isAchTransaction } = transactionType || {};

  return {
    type,
    externalId: transactionID || externalId,
    referenceId: payload.referenceID || referenceId,
    amount: parseFloat(amount),
    gateway: isAchTransaction ? PaymentGateway.TabapayACH : PaymentGateway.Tabapay,
    outcome: { code: networkRC },
    processor: isAchTransaction ? PaymentProcessor.TabapayACH : PaymentProcessor.Tabapay,
    raw: payload,
    reversalStatus: formatReversalStatus(reversal),
    status: formatTransactionStatus(status, networkRC),
  };
}
