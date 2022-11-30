import { SubscriptionBillingPromotion } from '../../src/models';
import * as Faker from 'faker';

export default function(factory: any) {
  factory.define('subscription-billing-promotion', SubscriptionBillingPromotion, {
    description: () => Faker.random.words(),
    code: () => Faker.random.word(),
    months: () => Faker.random.number(),
  });
}
