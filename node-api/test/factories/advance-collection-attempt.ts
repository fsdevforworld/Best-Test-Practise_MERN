import { AdvanceCollectionAttempt } from '../../src/models';
import * as Faker from 'faker';

export default function(factory: any) {
  factory.define('advance-collection-attempt', AdvanceCollectionAttempt, {
    advanceId: factory.assoc('advance', 'id'),
    amount: () => Faker.random.number(75),
  });

  factory.extend('advance-collection-attempt', 'successful-advance-collection-attempt', {
    /**
     *  for now this is enough because the
     *  default attributes for the payment
     *  factory include status: 'COMPLETED'
     */
    paymentId: factory.assoc('payment', 'id'),
    processing: null,
  });
}
