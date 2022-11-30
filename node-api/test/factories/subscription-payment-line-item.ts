import { SubscriptionPaymentLineItem } from '../../src/models';

export default function(factory: any) {
  factory.define(
    'subscription-payment-line-item',
    SubscriptionPaymentLineItem,
    {
      subscriptionBillingId: factory.assoc('subscription-billing', 'id'),
      subscriptionPaymentId: factory.assoc('subscription-payment', 'id'),
    }, // Exists so `factory.cleanUp` will mop these up, too.
  );
}
