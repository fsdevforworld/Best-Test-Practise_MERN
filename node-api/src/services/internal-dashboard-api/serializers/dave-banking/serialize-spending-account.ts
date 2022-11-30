import serialize from '../serialize';
import { IInternalApiBankAccount } from '@dave-inc/banking-internal-api-client';
import IDaveSpendingAccountResource from './i-spending-account-resource';
import serializeRelationships from '../serialize-relationships';
import { serializeDate } from '../../../../serialization';

const serializer: serialize<
  IInternalApiBankAccount,
  IDaveSpendingAccountResource
> = async function serializeSpendingAccount(daveBankingAccount, relationships) {
  const {
    id,
    accountNumber,
    currentBalance,
    createdAt,
    name,
    routingNumber,
    status,
  } = daveBankingAccount;

  return {
    id,
    type: 'spending-account',
    attributes: {
      accountNumber,
      currentBalance,
      created: serializeDate(createdAt),
      name,
      routingNumber,
      status,
    },
    relationships: serializeRelationships(relationships),
  };
};

export default serializer;
