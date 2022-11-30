import {
  getPaymentGateway as getGateway,
  PaymentGateway,
  PaymentProcessor,
  PaymentProviderTransaction,
  PaymentProviderTransactionStatus,
} from '@dave-inc/loomis-client';
import { moment } from '@dave-inc/time-lib';
import { ExternalTransactionStatus, TransactionSettlementStatus } from '@dave-inc/wire-typings';

import { dogstatsd } from '../../lib/datadog-statsd';
import { InvalidParametersError } from '../../lib/error';

import logger from '../../lib/logger';

import { RefreshExternalTransactionOptions } from '../../typings';

import { TransactionSettlement } from '../../models';

import { PaymentProviderGatewayParams } from '../payment';

import { buildFetchRequest } from './build-request';
import { isNil } from 'lodash';

export const RefreshErrorResponses = [
  PaymentProviderTransactionStatus.InvalidRequest,
  PaymentProviderTransactionStatus.NetworkError,
  PaymentProviderTransactionStatus.RateLimit,
];

export type RefreshExternalTransactionUpdates = {
  externalId: string;
  referenceId: string;
  processor: PaymentProcessor;
  status?: ExternalTransactionStatus;
};

type RefreshExternalTransactionRawResponse = {
  updates: RefreshExternalTransactionUpdates;
  fetchedTransaction?: PaymentProviderTransaction;
};

export type RefreshExternalTransactionResponse = {
  updates: RefreshExternalTransactionUpdates;
  fetchedTransactions?: PaymentProviderTransaction[];
  shouldRetry?: boolean;
  success?: boolean;
};

enum Metric {
  ProcessorNullStatus = 'refresh_external_transaction.processor.null_status',
}

const finalStatusPossibilities = [
  ExternalTransactionStatus.Returned,
  ExternalTransactionStatus.Completed,
  ExternalTransactionStatus.Pending,
  ExternalTransactionStatus.Canceled,
];

export async function refreshExternalTransaction(
  paymentProviders: PaymentProviderGatewayParams[],
  options: RefreshExternalTransactionOptions,
): Promise<RefreshExternalTransactionResponse> {
  let finalResponse: RefreshExternalTransactionResponse;

  const defaultUpdates = {
    externalId: options.externalId,
    referenceId: options.referenceId,
    processor: options.processor,
    status: options.status,
  };

  const possibleResponses: RefreshExternalTransactionRawResponse[] = [];
  if (
    paymentProviders.some(({ processor }) => processor === PaymentProcessor.Tabapay) &&
    Boolean(options.transactionSettlementSource)
  ) {
    finalResponse = await getTransactionSettlementResponse(options, defaultUpdates);
    if (Boolean(finalResponse)) {
      return finalResponse; // do not loop through payment providers if there is a transaction settlement DB row
    }
  }

  for (const paymentProvider of paymentProviders) {
    const request = await buildFetchRequest(
      options,
      paymentProvider.processor,
      options.type,
      options.sourceId,
    );

    const { updates, fetchedTransaction } = await fetchProcessorRefresh(paymentProvider, request);
    possibleResponses.push({ updates, fetchedTransaction });

    if (finalStatusPossibilities.includes(updates.status)) {
      finalResponse = {
        updates,
        fetchedTransactions: [fetchedTransaction],
        shouldRetry: false,
        success: true,
      };

      break;
    }
  }

  if (!Boolean(finalResponse)) {
    finalResponse = handleNonConclusiveRefresh(
      defaultUpdates,
      possibleResponses,
      options,
      paymentProviders,
    );
  }

  return finalResponse;
}

export async function getTransactionSettlementResponse(
  options: RefreshExternalTransactionOptions,
  defaultUpdates: RefreshExternalTransactionUpdates,
): Promise<RefreshExternalTransactionResponse | undefined> {
  let settlementWhere;

  if (Boolean(options.transactionSettlementSource)) {
    settlementWhere = {
      sourceId: options.transactionSettlementSource.sourceId,
      sourceType: options.transactionSettlementSource.sourceType,
    };
  } else {
    return undefined;
  }

  const transactionSettlement = await TransactionSettlement.findOne({
    attributes: ['externalId', 'processor', 'status', 'updated'],
    where: settlementWhere,
  });

  const isFreshTransactionSettlement = transactionSettlement?.updated > options?.updated;

  if (isFreshTransactionSettlement) {
    return {
      updates: {
        ...defaultUpdates,
        externalId: transactionSettlement.externalId,
        processor: PaymentProcessor.Tabapay,
        status: mapTransactionSettlementStatus(transactionSettlement.status),
      },
      fetchedTransactions: [],
      shouldRetry: false,
      success: true,
    };
  } else {
    return undefined;
  }
}

function handleNonConclusiveRefresh(
  defaultUpdates: RefreshExternalTransactionUpdates,
  possibleResponses: RefreshExternalTransactionRawResponse[],
  options: RefreshExternalTransactionOptions,
  paymentProviders: PaymentProviderGatewayParams[],
): RefreshExternalTransactionResponse {
  const retryResponses = [
    PaymentProviderTransactionStatus.NetworkError,
    PaymentProviderTransactionStatus.RateLimit,
  ];

  const errorResponses = [PaymentProviderTransactionStatus.InvalidRequest, ...retryResponses];

  const allNotFound = possibleResponses.every(({ fetchedTransaction }) => {
    return (
      fetchedTransaction && fetchedTransaction.status === PaymentProviderTransactionStatus.NotFound
    );
  });

  if (allNotFound) {
    return {
      updates: {
        ...defaultUpdates,
        status: getAllNotFoundStatus(options, paymentProviders),
      },
      fetchedTransactions: possibleResponses.map(({ fetchedTransaction }) => fetchedTransaction),
      shouldRetry: false,
      success: false,
    };
  }

  const hasErrorResponse = possibleResponses.some(({ fetchedTransaction }) => {
    return fetchedTransaction && errorResponses.includes(fetchedTransaction.status);
  });

  const shouldRetry = possibleResponses.some(({ fetchedTransaction }) => {
    return fetchedTransaction && retryResponses.includes(fetchedTransaction.status);
  });

  if (hasErrorResponse) {
    return {
      updates: defaultUpdates,
      fetchedTransactions: possibleResponses.map(({ fetchedTransaction }) => fetchedTransaction),
      shouldRetry,
      success: false,
    };
  }
}

// Exported for testing
export function getAllNotFoundStatus(
  options: RefreshExternalTransactionOptions,
  paymentProviders: PaymentProviderGatewayParams[],
): ExternalTransactionStatus {
  if (
    !isNil(options.created) &&
    paymentProviders.some(p => p.gateway === PaymentGateway.Synapsepay)
  ) {
    if (moment().diff(options.created, 'seconds') < 86400) {
      return ExternalTransactionStatus.Unknown;
    }
  }

  return ExternalTransactionStatus.Canceled;
}

async function fetchProcessorRefresh(
  { gateway, processor }: PaymentProviderGatewayParams,
  request: RefreshExternalTransactionOptions,
): Promise<RefreshExternalTransactionRawResponse> {
  const supportedProcessors = [
    PaymentProcessor.Tabapay,
    PaymentProcessor.TabapayACH,
    PaymentProcessor.BankOfDave,
    PaymentProcessor.Synapsepay,
    PaymentProcessor.Blastpay,
    PaymentProcessor.Payfi,
  ];

  if (!supportedProcessors.includes(processor)) {
    logger.error(`buildProcessorFetchRefreshRequest not implemented for processor: ${processor}`);
    throw new InvalidParametersError(
      `buildProcessorFetchRefreshRequest not implemented for processor: ${processor}`,
    );
  }

  const gatewayClient = getGateway(gateway);

  const transaction = await gatewayClient.fetchTransaction(request);

  const updates = {
    externalId: request.externalId || transaction.externalId,
    referenceId: request.referenceId || transaction.referenceId,
    processor,

    status: mapRefreshTransactionStatus(transaction.status, processor),
  };

  return { updates, fetchedTransaction: transaction };
}

function mapTransactionSettlementStatus(status: TransactionSettlementStatus) {
  switch (status) {
    case TransactionSettlementStatus.Error:
    case TransactionSettlementStatus.Canceled:
      return ExternalTransactionStatus.Canceled;
    case TransactionSettlementStatus.Completed:
      return ExternalTransactionStatus.Completed;
    case TransactionSettlementStatus.Chargeback:
      return ExternalTransactionStatus.Returned;
    case TransactionSettlementStatus.Representment:
    case TransactionSettlementStatus.Pending:
    default:
      return ExternalTransactionStatus.Pending;
  }
}

function mapRefreshTransactionStatus(
  status: PaymentProviderTransactionStatus,
  processor: PaymentProcessor,
): ExternalTransactionStatus | null {
  const statusMap: { [key: string]: ExternalTransactionStatus } = {
    [PaymentProviderTransactionStatus.Canceled]: ExternalTransactionStatus.Canceled,
    [PaymentProviderTransactionStatus.Completed]: ExternalTransactionStatus.Completed,
    [PaymentProviderTransactionStatus.Failed]: ExternalTransactionStatus.Canceled,
    [PaymentProviderTransactionStatus.Pending]: ExternalTransactionStatus.Pending,
    [PaymentProviderTransactionStatus.Returned]: ExternalTransactionStatus.Returned,
  };
  const transactionStatus = statusMap[status];

  if (!transactionStatus) {
    // Do not throw an error because we want to try
    // all payment providers before failing
    dogstatsd.increment(Metric.ProcessorNullStatus, { processor });
    return null;
  }

  return transactionStatus;
}
