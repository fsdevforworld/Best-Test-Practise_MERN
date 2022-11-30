import { SubscriptionBillingPromotionCode } from '@dave-inc/wire-typings';
import factory from '../../test/factories';
import { SubscriptionBillingPromotion } from '../../src/models';

async function up() {
  const subscriptionBillingPromo = await SubscriptionBillingPromotion.findAll();

  if (subscriptionBillingPromo.length === 0) {
    await factory.create('subscription-billing-promotion', {
      id: 1,
      description: 'Churn Prevention Months',
      code: SubscriptionBillingPromotionCode.CHURN_PREVENTION_MONTHS,
      months: 3,
    });

    await factory.create('subscription-billing-promotion', {
      description: 'Sweatcoin new user promotion',
      code: 'SWEATCOIN',
      months: 2,
    });
  }
}

export { up };
