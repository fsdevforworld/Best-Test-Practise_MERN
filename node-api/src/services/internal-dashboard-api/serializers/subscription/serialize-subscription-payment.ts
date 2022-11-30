import { IApiResourceObject, IRawRelationships } from '../../../../typings';
import { SubscriptionPayment } from '../../../../models';
import { serializeDate } from '../../../../serialization';
import { serializeUniversalId } from '../payment-method';
import serializeRelationships from '../serialize-relationships';
import serialize from '../serialize';

interface ISubscriptionPaymentResource extends IApiResourceObject {
  type: 'subscription-payment';
  attributes: {
    subscriptionBillingId: number;
    paymentMethodUniversalId: string | null;
    amount: number;
    externalProcessor: string;
    externalId: string;
    referenceId: string;
    status: string;
    created: string;
    updated: string;
    deleted: string;
  };
}

const serializeSubscriptionPayment: serialize<
  SubscriptionPayment,
  ISubscriptionPaymentResource
> = async (payment: SubscriptionPayment, relationships?: IRawRelationships) => {
  // We have never implemented multiple billings per payment, so this simplifies FE data
  const [billing] = payment.subscriptionBillings || (await payment.getSubscriptionBillings());

  return {
    id: `${payment.id}`,
    type: 'subscription-payment',
    attributes: {
      subscriptionBillingId: billing?.id,
      paymentMethodUniversalId: serializeUniversalId(payment),
      amount: payment.amount,
      externalProcessor: payment.externalProcessor,
      externalId: payment.externalId,
      referenceId: payment.referenceId,
      status: payment.status,
      created: serializeDate(payment.created),
      updated: serializeDate(payment.updated),
      deleted: serializeDate(payment.deleted),
    },
    relationships: serializeRelationships(relationships),
  };
};

export { ISubscriptionPaymentResource };
export default serializeSubscriptionPayment;
