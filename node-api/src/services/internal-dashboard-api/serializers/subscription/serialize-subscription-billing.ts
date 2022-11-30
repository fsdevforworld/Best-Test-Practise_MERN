import { IApiResourceObject, IRawRelationships } from '../../../../typings';
import { SubscriptionBilling } from '../../../../models';
import { serializeDate } from '../../../../serialization';
import {
  getSubscriptionBillingStatus,
  FormattedBillingStatus,
  canWaiveSubscriptionBilling,
} from '../../domain/subscription-billing';
import serializeRelationships from '../serialize-relationships';
import serialize from '../serialize';

interface ISubscriptionBillingResource extends IApiResourceObject {
  type: 'subscription-billing';
  attributes: {
    userId: number;
    amount: number;
    billingCycle: string;
    dueDate: string;
    start: string;
    end: string;
    created: string;
    updated: string;
    status: FormattedBillingStatus;
    canWaive: boolean;
  };
}

const serializeSubscriptionBilling: serialize<
  SubscriptionBilling,
  ISubscriptionBillingResource
> = async (billing: SubscriptionBilling, relationships?: IRawRelationships) => {
  const [status, canWaive] = await Promise.all([
    getSubscriptionBillingStatus(billing.id),
    canWaiveSubscriptionBilling(billing.id),
  ]);

  return {
    type: 'subscription-billing',
    id: `${billing.id}`,
    attributes: {
      userId: billing.userId,
      amount: billing.amount,
      billingCycle: billing.billingCycle,
      dueDate: serializeDate(billing.dueDate, 'YYYY-MM-DD'),
      start: serializeDate(billing.start),
      end: serializeDate(billing.end),
      created: serializeDate(billing.created),
      updated: serializeDate(billing.updated),
      status,
      canWaive,
    },
    relationships: serializeRelationships(relationships),
  };
};

export { ISubscriptionBillingResource };
export default serializeSubscriptionBilling;
