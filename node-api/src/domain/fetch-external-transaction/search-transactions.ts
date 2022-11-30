import { getPaymentGateway as getGateway } from '@dave-inc/loomis-client';
import { TransactionSettlementStatus } from '@dave-inc/wire-typings';
import {
  ExternalTransactionSearchResult,
  FetchTransactionOptions,
  PaymentGateway,
  PaymentProviderSuccessStatus,
  PaymentProviderTransaction,
  PaymentProviderTransactionStatus,
  PaymentProviderTransactionType,
  TransactionSettlementSource,
} from '../../typings';
import { TransactionSettlement } from '../../models';
import { TransactionFetchError } from '../../lib/error';

const gatewayList = [PaymentGateway.Synapsepay, PaymentGateway.Tabapay, PaymentGateway.BankOfDave];

export async function searchExternalTransactions(
  transactionOptions: FetchTransactionOptions,
): Promise<ExternalTransactionSearchResult[]> {
  const { externalId } = transactionOptions;

  const transaction = externalId
    ? await searchTransactionByExternalId(transactionOptions)
    : await searchTransactionByReferenceId(transactionOptions);

  return transaction ? [transaction] : [];
}

async function searchTransactionByExternalId(
  transactionOptions: FetchTransactionOptions,
): Promise<ExternalTransactionSearchResult> {
  const { externalId } = transactionOptions;
  const settlement = await TransactionSettlement.findOne({ where: { externalId } });

  if (settlement) {
    return consolidateTransactionAndSettlement({ settlement });
  }

  const transaction = await searchTransactionInGatewayList(transactionOptions);
  return consolidateTransactionAndSettlement({ transaction });
}

async function searchTransactionByReferenceId(
  transactionOptions: FetchTransactionOptions,
): Promise<ExternalTransactionSearchResult> {
  const transaction = await searchTransactionInGatewayList(transactionOptions);

  if (!transaction || !transaction.externalId) {
    return consolidateTransactionAndSettlement({ transaction });
  }

  const { externalId } = transaction;
  const settlement = await TransactionSettlement.findOne({ where: { externalId } });
  return consolidateTransactionAndSettlement({ transaction, settlement });
}

async function searchTransactionInGatewayList(
  transactionOptions: FetchTransactionOptions,
): Promise<PaymentProviderTransaction> {
  let error: Error;
  const gatewayPromises = gatewayList.map(async gatewayName => {
    const paymentGateway = getGateway(gatewayName);

    if (
      transactionOptions.type === PaymentProviderTransactionType.BankFunding &&
      gatewayName !== PaymentGateway.Tabapay
    ) {
      return null;
    }

    const response = await paymentGateway.fetchTransaction(transactionOptions);

    if (!response || response.status === PaymentProviderTransactionStatus.NotFound) {
      return null;
    }

    if (response.status in PaymentProviderSuccessStatus) {
      return response;
    }

    error =
      error ||
      new TransactionFetchError(`Error fetching transaction from gateway ${gatewayName}`, {
        data: response.raw,
      });
    return null;
  });

  const transactions = await Promise.all(gatewayPromises);
  const transaction = transactions.find(trx => trx !== null);
  if (transaction) {
    return transaction;
  }

  throw error;
}

function consolidateTransactionAndSettlement({
  transaction,
  settlement,
}: {
  transaction?: PaymentProviderTransaction;
  settlement?: TransactionSettlement;
}): ExternalTransactionSearchResult {
  const isSettlement = Boolean(settlement);

  if (!settlement) {
    return transaction ? { ...transaction, isSettlement } : null;
  }

  const { externalId, raw, amount, processor } = settlement;
  return {
    ...transaction,
    externalId,
    amount,
    processor,
    settlementRaw: raw,
    type: mapTransactionSettlementType(settlement.sourceType),
    status: mapTransactionSettlementStatus(settlement.status),
    isSettlement,
  };
}

function mapTransactionSettlementType(
  type: TransactionSettlementSource,
): PaymentProviderTransactionType {
  switch (type) {
    case TransactionSettlementSource.Advance:
      return PaymentProviderTransactionType.AdvanceDisbursement;
    case TransactionSettlementSource.Payment:
      return PaymentProviderTransactionType.AdvancePayment;
    case TransactionSettlementSource.SubscriptionPayment:
    default:
      return PaymentProviderTransactionType.SubscriptionPayment;
  }
}

function mapTransactionSettlementStatus(
  status: TransactionSettlementStatus,
): PaymentProviderTransactionStatus {
  switch (status) {
    case TransactionSettlementStatus.Error:
    case TransactionSettlementStatus.Canceled:
      return PaymentProviderTransactionStatus.Canceled;
    case TransactionSettlementStatus.Completed:
      return PaymentProviderTransactionStatus.Completed;
    case TransactionSettlementStatus.Chargeback:
      return PaymentProviderTransactionStatus.Returned;
    case TransactionSettlementStatus.Representment:
    case TransactionSettlementStatus.Pending:
    default:
      return PaymentProviderTransactionStatus.Pending;
  }
}
