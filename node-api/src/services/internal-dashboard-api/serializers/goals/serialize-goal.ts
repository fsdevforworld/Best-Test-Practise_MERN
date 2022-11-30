import { IApiGoal } from '@dave-inc/banking-goals-internal-api-client';
import serialize from '../serialize';
import serializeRelationships from '../serialize-relationships';
import IGoalResource from './i-goal-resource';

const serializer: serialize<IApiGoal, IGoalResource> = async function serializeGoal(
  goal,
  relationships,
) {
  const {
    id,
    closedAt,
    created,
    currentBalance,
    lastTransferDate = null,
    name,
    targetAmount,
    status,
    motivation,
  } = goal;

  return {
    id,
    type: 'goal',
    attributes: {
      created,
      closedAt,
      currentBalance,
      lastTransferAt: lastTransferDate,
      name,
      targetAmount,
      status,
      motivation,
    },
    relationships: serializeRelationships(relationships),
  };
};

export default serializer;
