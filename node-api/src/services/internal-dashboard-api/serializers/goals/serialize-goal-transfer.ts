import { IApiGoalTransfer } from '@dave-inc/banking-goals-internal-api-client';
import { serializeDate } from '../../../../serialization';
import serialize from '../serialize';
import IGoalTransferResource from './i-goal-transfer';

import { getFundingSource } from '../../domain/goals';

const serializer: serialize<IApiGoalTransfer, IGoalTransferResource> = async transfer => {
  const {
    id,
    amount,
    balanceAfter,
    completedAt,
    description,
    failedAt,
    goalId,
    initiatedAt,
    recurringTransferId,
    status,
    targetAccountId,
    transferType,
  } = transfer;

  const { fundingSourceId, fundingSourceType } = await getFundingSource(
    targetAccountId,
    transferType,
  );

  return {
    id,
    type: 'goal-transfer',
    attributes: {
      amount,
      balanceAfter,
      completed: serializeDate(completedAt),
      description,
      failed: serializeDate(failedAt),
      initiated: serializeDate(initiatedAt),
      status,
      transferType,
    },
    relationships: {
      goal: { data: { id: goalId, type: 'goal' } },
      recurringTransfer: {
        data: recurringTransferId ? { id: recurringTransferId, type: 'recurring-transfer' } : null,
      },
      fundingSource: {
        data: fundingSourceId ? { id: fundingSourceId, type: fundingSourceType } : null,
      },
    },
  };
};

export default serializer;
