import { IApiGoalAccount } from '@dave-inc/banking-goals-internal-api-client';
import serialize from '../serialize';
import serializeRelationships from '../serialize-relationships';
import IGoalAccountResource from './i-goal-account';

const serializer: serialize<
  IApiGoalAccount,
  IGoalAccountResource
> = async function serializeGoalAccount(account, relationships) {
  return {
    id: `${account.id}`,
    type: 'goals-account',
    attributes: {
      status: account.status,
    },
    relationships: serializeRelationships(relationships),
  };
};

export default serializer;
