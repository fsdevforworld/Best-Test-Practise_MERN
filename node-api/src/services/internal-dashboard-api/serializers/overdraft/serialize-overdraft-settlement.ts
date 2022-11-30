import { IInternalSettlementResponse } from '@dave-inc/overdraft-internal-client';
import serialize from '../serialize';
import IOverdraftSettlementResource from './i-overdraft-settlement-resource';

const serializeOverdraftSettlement: serialize<
  IInternalSettlementResponse,
  IOverdraftSettlementResource
> = async overdraft => {
  const { id, amount, created, overdraftId, settlementMethodLoomisId, status } = overdraft;

  return {
    id: `${id}`,
    type: 'overdraft-settlement',
    attributes: {
      amount,
      created,
      status,
    },
    relationships: {
      overdraft: { data: { id: overdraftId, type: 'overdraft' } },
      source: { data: { id: settlementMethodLoomisId, type: 'payment-method' } },
    },
  };
};

export default serializeOverdraftSettlement;
