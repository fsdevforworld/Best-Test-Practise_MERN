import { IApiScheduledRecurringGoalTransfer } from '@dave-inc/banking-goals-internal-api-client';
import serialize from '../serialize';
import serializeRelationships from '../serialize-relationships';
import IRecurringTransferResource from './i-recurring-transfer';

const serializer: serialize<
  IApiScheduledRecurringGoalTransfer,
  IRecurringTransferResource
> = async function serializeRecurringTransfer(recurringGoalTransfer, relationships) {
  const {
    amount,
    created,
    nextScheduledOn,
    recurringTransferId,
    recurrence: { interval, intervalParams },
  } = recurringGoalTransfer;

  return {
    id: recurringTransferId,
    type: 'recurring-transfer',
    attributes: {
      amount,
      created,
      interval,
      intervalParams,
      nextScheduledOn,
    },
    relationships: serializeRelationships(relationships),
  };
};

export default serializer;
