import * as Bluebird from 'bluebird';
import { Message } from '@google-cloud/pubsub';
import { dogstatsd } from '../../lib/datadog-statsd';
import logger from '../../lib/logger';
import { Advance, AuditLog } from '../../models';
import { ITivanAdvanceProcessed, TivanResult } from '../../typings';

const LOG_TYPE: string = 'TIVAN_RESULT';

export async function processTivanRepaymentResult(event: Message, data: ITivanAdvanceProcessed) {
  dogstatsd.increment('repayment_result_processor.event_received');

  const { task } = data;

  const advanceId = task?.advanceTasks[0]?.advanceId;

  if (!advanceId) {
    dogstatsd.increment('repayment_result_processor.no_advance_tasks');

    event.ack();

    return;
  }

  const advance = await Advance.findByPk(advanceId);

  await Bluebird.each(task.taskPaymentMethods, async pm => {
    await Bluebird.each(pm.taskPaymentResults, async taskPaymentResult => {
      const decimalAmountCollected = convertTivanAmount(taskPaymentResult.amountPennies);

      if (taskPaymentResult.result === TivanResult.Success) {
        await markWorkflowSuccess(advance, {
          decimalAmountCollected,
        });

        dogstatsd.increment('repayment_result_processor.tivan_adavnce_workflow_marked_completed');
      }

      if (taskPaymentResult.result === TivanResult.Pending) {
        logger.info('A paymentResult for this advance is still pending', { advanceId });

        dogstatsd.increment('repayment_result_processor.tivan_workflow_pending');
      }

      if (taskPaymentResult.result === TivanResult.Failure) {
        await markWorkflowFailureOrError(advance, decimalAmountCollected);

        dogstatsd.increment('repayment_result_processor.tivan_workflow_failed');
      }

      if (taskPaymentResult.result === TivanResult.Error) {
        await markWorkflowFailureOrError(advance, decimalAmountCollected);

        dogstatsd.increment('repayment_result_processor.tivan_workflow_error');
      }
    });
  });

  event.ack();
}

async function markWorkflowSuccess(
  advance: Advance,
  { decimalAmountCollected }: { decimalAmountCollected: number },
) {
  await AuditLog.create({
    eventUuid: advance.id,
    userId: advance.userId,
    successful: true,
    type: LOG_TYPE,
    message: `Successfully completed a Tivan repayment workflow for advanceId ${advance.id} and amount ${decimalAmountCollected}`,
  });
}

async function markWorkflowFailureOrError(advance: Advance, decimalAmount: number) {
  await AuditLog.create({
    eventUuid: advance.id,
    userId: advance.userId,
    successful: false,
    type: LOG_TYPE,
    message: `Tivan repayment workflow failed for  advanceId ${advance.id} and amount ${decimalAmount}`,
  });
}

/**
 * Tivan and Loomis use a negative amount to represent a payment, as opposed to
 * positive amounts to represent a disbursement. Tivan also records and
 * publishes taskPaymentResult amounts in pennies, whereas node-api
 * records a decimal amount
 */
function convertTivanAmount(negativeAmountPennies: number): number {
  const positiveAmountPennies = negativeAmountPennies * -1;

  return positiveAmountPennies / 100;
}
