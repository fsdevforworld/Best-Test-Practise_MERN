import { serializeDate } from '../../../../serialization';
import { Payment } from '../../../../models';

import { IApiResourceObject } from '../../../../typings';
import serialize from '../serialize';
import serializeRelationships from '../serialize-relationships';
import { serializeUniversalId } from '../payment-method';

export interface IAdvancePaymentResource extends IApiResourceObject {
  type: 'advance-payment';
  attributes: {
    amount: number;
    status: string;
    externalProcessor: string;
    externalId: string;
    referenceId: string;
    created: string;
    updated: string;
    deleted: string;
  };
}

const serializer: serialize<
  Payment,
  IAdvancePaymentResource
> = async function serializeAdvancePayment(payment, relationships) {
  const { advanceId, userId } = payment;

  return {
    id: `${payment.id}`,
    type: 'advance-payment',
    attributes: {
      amount: payment.amount,
      status: payment.status,
      externalProcessor: payment.externalProcessor,
      externalId: payment.externalId,
      referenceId: payment.referenceId,
      created: serializeDate(payment.created),
      updated: serializeDate(payment.updated),
      deleted: serializeDate(payment.deleted),
    },
    relationships: {
      advance: { data: { id: `${advanceId}`, type: 'advance' } },
      user: { data: { id: `${userId}`, type: 'user' } },
      source: { data: { id: serializeUniversalId(payment), type: 'payment-method' } },
      ...serializeRelationships(relationships),
    },
  };
};

export default serializer;
