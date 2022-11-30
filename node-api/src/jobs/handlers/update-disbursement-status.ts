import { dogstatsd } from '../../lib/datadog-statsd';
import { TaskShouldRetry } from '../../lib/error';
import { UpdateDisbursementStatusData } from '../data';
import { Advance, PaymentMethod } from '../../models';
import {
  PaymentGateway,
  PaymentProcessor,
  PaymentProviderErrorStatus,
  PaymentProviderTransactionType,
} from '@dave-inc/loomis-client';
import { TransactionSettlementSource } from '../../typings';
import AdvanceHelper from '../../helper/advance';
import { refreshExternalTransaction } from '../../domain/fetch-external-transaction';
import { ExternalTransactionProcessor, ExternalTransactionStatus } from '@dave-inc/wire-typings';

function getPaymentGatewayAndProcessor(paymentMethod: PaymentMethod) {
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

  const { tabapayId, risepayId } = paymentMethod;
  const providers = [];
  if (tabapayId) {
    providers.push({
      gateway: PaymentGateway.Tabapay,
      processor: PaymentProcessor.Tabapay,
      sourceId: tabapayId,
    });
  }

  if (risepayId) {
    providers.push({
      gateway: PaymentGateway.Risepay,
      processor: PaymentProcessor.Tabapay,
      sourceId: risepayId,
    });
  }

  return providers;
}

export async function updateDisbursementStatus(data: UpdateDisbursementStatusData): Promise<void> {
  const { advanceId } = data;

  const advance = await Advance.findByPk(advanceId);

  if (!advance) {
    dogstatsd.increment('update_disbursement.advance_not_found');
    return;
  }

  const { referenceId, disbursementProcessor, disbursementStatus: oldStatus } = advance;

  if (!referenceId) {
    dogstatsd.increment('update_disbursement.missing_reference_id');
    return;
  }

  let gatewayName: PaymentGateway;
  let processorName: PaymentProcessor;
  if (disbursementProcessor === ExternalTransactionProcessor.BankOfDave) {
    gatewayName = PaymentGateway.BankOfDave;
    processorName = PaymentProcessor.BankOfDave;
  } else if (disbursementProcessor === ExternalTransactionProcessor.Synapsepay) {
    gatewayName = PaymentGateway.Synapsepay;
    processorName = PaymentProcessor.Synapsepay;
  } else if (disbursementProcessor === ExternalTransactionProcessor.TabapayACH) {
    gatewayName = PaymentGateway.TabapayACH;
    processorName = PaymentProcessor.TabapayACH;
  } else {
    const paymentMethod = await advance.getPaymentMethod();
    const [provider] = await getPaymentGatewayAndProcessor(paymentMethod);
    gatewayName = provider.gateway;
    processorName = provider.processor;
  }

  const {
    updates,
    fetchedTransactions: [fetchedTransaction],
    shouldRetry,
  } = await refreshExternalTransaction([{ gateway: gatewayName, processor: processorName }], {
    bankAccountId: advance.bankAccountId,
    externalId: advance.externalId,
    referenceId: advance.referenceId,
    status: advance.disbursementStatus,
    transactionSettlementSource: {
      sourceId: advance.id,
      sourceType: TransactionSettlementSource.Advance,
    },
    type: PaymentProviderTransactionType.AdvanceDisbursement,
    updated: advance.updated,
    userId: advance.userId,
  });

  if (fetchedTransaction?.status in PaymentProviderErrorStatus) {
    const error = (fetchedTransaction.raw || {}) as { status?: string; message?: string }; //failed statuses do not have errors
    dogstatsd.increment('update_advance_disbursement_status.fetch_error', 1, [
      `err_name:${error.status}`,
      `err_msg:${error.message}`,
      `delivery:${advance.delivery}`,
      `processor:${processorName}`,
      `gateway:${gatewayName}`,
    ]);
  }

  if (updates?.status === ExternalTransactionStatus.Canceled) {
    await AdvanceHelper.updateDisbursementStatus(advance, ExternalTransactionStatus.Canceled);
    dogstatsd.increment('update_advance_disbursement_status.advance_canceled', 1, [
      `delivery:${advance.delivery}`,
      `processor:${processorName}`,
      `gateway:${gatewayName}`,
    ]);
    return;
  }

  if (shouldRetry) {
    throw new TaskShouldRetry('task updateDisbursementStatus needs to be retried');
  }

  const {
    status: newStatus,
    processor: newDisbursementProcessor,
    externalId: newExternalId,
  } = updates;

  if (newStatus) {
    if (newStatus !== oldStatus) {
      await AdvanceHelper.updateDisbursementStatus(advance, newStatus);
      await advance.update({
        externalId: newExternalId,
        disbursementProcessor: newDisbursementProcessor,
      });
      dogstatsd.increment('update_disbursement.advance_successfully_updated', {
        delivery: advance.delivery,
        processor: processorName,
        gateway: gatewayName,
      });
    } else {
      dogstatsd.increment('update_disbursement.no_change', {
        delivery: advance.delivery,
        processor: processorName,
        gateway: gatewayName,
      });
    }
  } else {
    await AdvanceHelper.updateDisbursementStatus(advance, ExternalTransactionStatus.Canceled);
    dogstatsd.increment('update_disbursement.advance_canceled', {
      delivery: advance.delivery,
      processor: processorName,
      gateway: gatewayName,
    });
  }
}
