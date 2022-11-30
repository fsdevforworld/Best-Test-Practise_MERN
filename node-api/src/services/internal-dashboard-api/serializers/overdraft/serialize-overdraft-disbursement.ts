import { IInternalDisbursementResponse } from '@dave-inc/overdraft-internal-client';
import serialize from '../serialize';
import IOverdraftDisbursementResource from './i-overdraft-disbursement-resource';

const serializeOverdraftDisbursement: serialize<
  IInternalDisbursementResponse,
  IOverdraftDisbursementResource
> = async overdraft => {
  const { id, amount, overdraftId, disbursementMethodLoomisId, status } = overdraft;

  return {
    id: `${id}`,
    type: 'overdraft-disbursement',
    attributes: {
      amount,
      status,
    },
    relationships: {
      overdraft: { data: { id: overdraftId, type: 'overdraft' } },
      source: { data: { id: disbursementMethodLoomisId, type: 'payment-method' } },
    },
  };
};

export default serializeOverdraftDisbursement;
