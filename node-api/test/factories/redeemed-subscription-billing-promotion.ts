import { RedeemedSubscriptionBillingPromotion } from '../../src/models';

export default function(factory: any) {
  factory.define('redeemed-subscription-billing-promotion', RedeemedSubscriptionBillingPromotion, {
    userId: factory.assoc('user'),
    subscriptionBillingPromotionId: factory.assoc('subscription-billing-promotion'),
  });
}
