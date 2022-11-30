import { SubscriptionCollectionAttempt } from '../../src/models';

export default function(factory: any) {
  factory.define('subscription-collection-attempt', SubscriptionCollectionAttempt, {
    subscriptionBillingId: factory.assoc('subscription-billing', 'id'),
  });
}
