import { moment } from '@dave-inc/time-lib';
import { PaymentMethod } from '../../src/models';
import * as Faker from 'faker';

export default function(factory: any) {
  factory.define('payment-method', PaymentMethod, {
    availability: 'immediate',
    mask: '0000',
    scheme: 'visa',
    displayName: 'My Checking',
    expiration: moment()
      .add(1, 'year')
      .format('YYYY-MM-DD'),
    bankAccountId: factory.assoc('checking-account', 'id'),
    userId: factory.assoc('user', 'id'),
    tabapayId: () => Faker.random.alphaNumeric(8),
  });

  factory.extend('payment-method', 'payment-method-risepay', {
    risepayId: () => Faker.random.alphaNumeric(8),
    tabapayId: undefined,
  });

  factory.extend('payment-method', 'payment-method-risepay-and-tabapay', {
    risepayId: () => Faker.random.alphaNumeric(8),
  });
}
