import { IInternalGetAccountResponseAccount } from '@dave-inc/overdraft-internal-client';
import serialize from '../serialize';
import serializeRelationships from '../serialize-relationships';
import IOverdraftAccountResource from './i-overdraft-account-resource';

const serializeOverdraftAccount: serialize<
  IInternalGetAccountResponseAccount,
  IOverdraftAccountResource
> = async (overdraft, relationships) => {
  const { id, balance, status } = overdraft;

  return {
    id: `${id}`,
    type: 'overdraft-account',
    attributes: {
      balance,
      status,
    },
    relationships: {
      ...serializeRelationships(relationships),
    },
  };
};

export default serializeOverdraftAccount;
