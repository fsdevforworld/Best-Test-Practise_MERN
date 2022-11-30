import { ExternalTransactionProcessor } from '@dave-inc/wire-typings';
import { InvalidParametersError, NotFoundError } from '@dave-inc/error-types';
import * as Loomis from '@dave-inc/loomis-client';
import {
  PaymentGateway,
  PaymentProcessor,
  PaymentProviderTransactionType,
} from '@dave-inc/loomis-client';
import logger from '../../lib/logger';
import { Reimbursement } from '../../models';
import { ReimbursementExternalProcessor } from '../../models/reimbursement';
import { dogstatsd } from '../../lib/datadog-statsd';
import { UpdateReimbursementStatusQueueData } from './../data';

function getPaymentProvider(
  externalProcessor: ReimbursementExternalProcessor,
): {
  paymentGateway: PaymentGateway;
  paymentProcessor: PaymentProcessor;
} {
  switch (externalProcessor.valueOf()) {
    case ExternalTransactionProcessor.Synapsepay.valueOf():
      return {
        paymentGateway: PaymentGateway.Synapsepay,
        paymentProcessor: PaymentProcessor.Synapsepay,
      };
    case ExternalTransactionProcessor.BankOfDave.valueOf():
      return {
        paymentGateway: PaymentGateway.BankOfDave,
        paymentProcessor: PaymentProcessor.BankOfDave,
      };
    case ExternalTransactionProcessor.Tabapay.valueOf():
      return {
        paymentGateway: PaymentGateway.Tabapay,
        paymentProcessor: PaymentProcessor.Tabapay,
      };
    case ExternalTransactionProcessor.TabapayACH.valueOf():
      return {
        paymentGateway: PaymentGateway.TabapayACH,
        paymentProcessor: PaymentProcessor.TabapayACH,
      };
    default:
      dogstatsd.increment('update_reimbursement_status.unsupported_processor');
      throw new InvalidParametersError(`Unsupported external processor: ${externalProcessor}`);
  }
}

export async function run(reimbursementId: number): Promise<void> {
  dogstatsd.increment('update_reimbursement_status.job_triggered');

  const reimbursement = await Reimbursement.findByPk(reimbursementId);

  if (!reimbursement) {
    dogstatsd.increment('update_reimbursement_status.transaction_not_found');
    throw new NotFoundError('Reimbursement transaction does not exist');
  }

  const { externalId, externalProcessor, referenceId } = reimbursement;

  if ((!externalId && !referenceId) || !externalProcessor) {
    dogstatsd.increment('update_reimbursement_status.missing_external_reference_ids');
    logger.warn('Missing necessary reference data, cannot update', { reimbursement });
    throw new InvalidParametersError('Missing necessary reference data, cannot update');
  }

  const paymentProviderOptions = getPaymentProvider(externalProcessor);
  const paymentGateway = Loomis.getPaymentGateway(paymentProviderOptions.paymentGateway);

  let response: Loomis.PaymentProviderTransaction;
  try {
    response = await paymentGateway.fetchTransaction({
      type: PaymentProviderTransactionType.AdvanceDisbursement, // Used for reimbursements
      externalId,
      processor: paymentProviderOptions.paymentProcessor,
      referenceId,
      daveUserId: reimbursement.userId,
    });

    await reimbursement.update({
      status: response.status,
      externalId: externalId || response.externalId,
    });

    dogstatsd.increment('update_reimbursement_status.job_succeded');
  } catch (error) {
    logger.error(`Failed updating reimbursement ${reimbursementId}`, {
      error,
      reimbursement,
      response,
    });
    throw error;
  }
}

export async function updateReimbursementStatus({
  reimbursementId,
}: UpdateReimbursementStatusQueueData) {
  try {
    await run(reimbursementId);
  } catch (error) {
    logger.error('Failed updating reimbursement status', error);
    dogstatsd.increment('update_reimbursement_status.job_failed');
  }
}
