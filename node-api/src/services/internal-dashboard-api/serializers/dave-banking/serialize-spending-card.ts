import serialize from '../serialize';
import { IApiCard } from '@dave-inc/banking-internal-api-client';
import IDaveBankingCardResource from './i-dave-banking-card-resource';
import { serializeDate } from '../../../../serialization';

const serializer: serialize<
  IApiCard,
  IDaveBankingCardResource
> = async function serializeSpendingCard(daveBankingAccount) {
  const { id, bankAccountId, createdAt, status, isVirtual, lastFour } = daveBankingAccount;

  return {
    id,
    type: 'spending-card',
    attributes: {
      created: serializeDate(createdAt),
      status,
      isVirtual,
      lastFour,
    },
    relationships: {
      bankAccount: { data: { type: 'bank-account', id: bankAccountId } },
    },
  };
};

export default serializer;
