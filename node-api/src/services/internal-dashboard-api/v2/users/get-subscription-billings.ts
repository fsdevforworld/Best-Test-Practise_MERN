import { SubscriptionBilling, User } from '../../../../models';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { serializeMany, subscriptionSerializers } from '../../serializers';

async function getSubscriptionBillings(
  req: IDashboardApiResourceRequest<User>,
  res: IDashboardV2Response<subscriptionSerializers.ISubscriptionBillingResource[]>,
) {
  const billings = await SubscriptionBilling.findAll({
    where: { userId: req.resource.id },
  });

  const serializedBillings = await serializeMany(
    billings,
    subscriptionSerializers.serializeSubscriptionBilling,
  );

  const response = {
    data: serializedBillings,
  };

  return res.send(response);
}

export default getSubscriptionBillings;
