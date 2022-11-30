import * as Faker from 'faker';
import { sample } from 'lodash';
import { PaymentReversal } from '../../src/models';
import { ReversalStatus } from '../../src/typings';

export default function(factory: any) {
  factory.define('payment-reversal', PaymentReversal, {
    amount: () => Faker.random.number({ min: 0.01, max: 100 }),
    paymentId: factory.assoc('payment', 'id'),
    status: () => sample([ReversalStatus.Completed, ReversalStatus.Pending, ReversalStatus.Failed]),
  });
}
