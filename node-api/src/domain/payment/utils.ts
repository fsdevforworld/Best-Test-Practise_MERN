import { getPaymentGateway as getGateway } from '@dave-inc/loomis-client';
import { compact, get } from 'lodash';

import { dogstatsd } from '../../lib/datadog-statsd';
import { InvalidParametersError } from '../../lib/error';

import {
  Advance,
  Payment,
  PaymentMethod,
  SubscriptionPayment,
  TransactionSettlement,
} from '../../models';

import { ExternalTransactionProcessor, ExternalTransactionStatus } from '@dave-inc/wire-typings';

import { TransactionSettlementStatus } from '@dave-inc/wire-typings';
import {
  PaymentGateway,
  PaymentProcessor,
  PaymentProviderSuccessStatus,
  PaymentProviderTransactionStatus,
  PaymentProviderTransactionType,
} from '../../typings';

import { buildFetchRequest } from '../fetch-external-transaction';
import logger from '../../lib/logger';

export type PaymentProviderGatewayParams = {
  gateway: PaymentGateway;
  processor: PaymentProcessor;
  sourceId?: string;
};

export enum PaymentUpdateTrigger {
  AdminScript = 'admin-script',
  DashboardRequest = 'dashboard-request',
  TransactionSettlementImportJob = 'transaction-settlement-import-job',
  UpdatePendingPaymentJob = 'update-pending-payment-job',
  BankOfDaveTransactionConsumer = 'bank-of-dave-transaction-consumer',
  SynapseUpsertTransaction = 'synapse-upsert-transaction',
}
export async function fetchExternalTransactions(payment: Payment) {
  const potentialProviderInfoForCharges = await getPossiblePaymentProviders(payment);

  const transactionRequests = potentialProviderInfoForCharges.map(async providerInfo => {
    const request = await fetchExternalTransaction(payment, providerInfo);
    return request;
  });

  const transactions = await Promise.all(transactionRequests);

  return compact(transactions);
}
export function fetchTransactionSettlement(
  payment: Payment,
): PromiseLike<TransactionSettlement> | undefined {
  const { externalId, externalProcessor } = payment;

  if (externalId && externalProcessor === ExternalTransactionProcessor.Tabapay) {
    return TransactionSettlement.findOne({
      where: {
        externalId,
        processor: externalProcessor,
      },
    });
  }
}

export function mapTransactionSettlementStatus(status: TransactionSettlementStatus) {
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

async function fetchExternalTransaction(
  payment: Payment,
  { gateway, processor, sourceId }: PaymentProviderGatewayParams,
) {
  const gatewayClient = getGateway(gateway);
  const fetchRequest = await buildFetchRequest(
    payment,
    processor,
    PaymentProviderTransactionType.AdvancePayment,
    sourceId,
  );

  const transaction = await gatewayClient.fetchTransaction(fetchRequest);

  if (!transaction || transaction.status === PaymentProviderTransactionStatus.NotFound) {
    return null;
  }

  if (transaction.status in PaymentProviderSuccessStatus) {
    return transaction;
  } else {
    /**
     * error handling
     */
    const error = (transaction.raw || {}) as { name?: string };
    dogstatsd.increment('update_payment_status.fetch_error', 1, [
      `err_name:${error.name}`,
      `processor:${processor}`,
      `gateway:${gateway}`,
    ]);

    logger.error('Error Fetching Transaction', {
      processor,
      error,
    });

    // for error cases we should return the failed transaction
    return transaction;
  }
}

export async function getPossiblePaymentProviders(
  payment: Payment | SubscriptionPayment,
): Promise<PaymentProviderGatewayParams[]> {
  const bodProvider = {
    gateway: PaymentGateway.BankOfDave,
    processor: PaymentProcessor.BankOfDave,
  };
  const synapseProvider = {
    gateway: PaymentGateway.Synapsepay,
    processor: PaymentProcessor.Synapsepay,
  };
  switch (payment.externalProcessor) {
    case ExternalTransactionProcessor.Synapsepay:
      return [synapseProvider];
    case ExternalTransactionProcessor.BankOfDave:
      return [bodProvider];
    case ExternalTransactionProcessor.Tabapay:
      return getDebitCardPaymentProviders(payment);
    case undefined:
    case null:
      dogstatsd.increment('refresh_payment.get_payment_providers.missing_external_processor');
      const debitCardProviders = await getDebitCardPaymentProviders(payment);
      return [synapseProvider, bodProvider, ...debitCardProviders];
    default:
      throw new InvalidParametersError(
        `External Processor ${payment.externalProcessor} is not valid.`,
      );
  }
}

async function getDebitCardPaymentProviders(payment: Payment | SubscriptionPayment) {
  const include = [
    {
      model: PaymentMethod,
      paranoid: false,
    },
  ] as any;

  if (payment instanceof Payment) {
    include.push({
      model: Advance,
      paranoid: false,
      include: [{ model: PaymentMethod, paranoid: false }],
    });
  }

  await payment.reload({
    include,
    paranoid: false,
  });

  const paymentMethod = payment.paymentMethod || get(payment, 'advance.paymentMethod');

  if (!paymentMethod) {
    // If the user creates a onetime charge there will be no payment method but we should still check tabapay
    return [
      {
        gateway: PaymentGateway.Tabapay,
        processor: PaymentProcessor.Tabapay,
        sourceId: null,
      },
    ];
  }

  const { tabapayId } = paymentMethod;
  const providers = [];
  if (tabapayId) {
    providers.push({
      gateway: PaymentGateway.Tabapay,
      processor: PaymentProcessor.Tabapay,
      sourceId: tabapayId,
    });
  }

  return providers;
}
