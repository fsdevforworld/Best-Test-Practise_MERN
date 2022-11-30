import { moment } from '@dave-inc/time-lib';
import { DefaultAdapter } from 'factory-girl';
import * as Faker from 'faker';

export default function(factory: any) {
  factory.setAdapter(new DefaultAdapter(), 'bod-transaction');
  factory.define('bod-transaction', Object, {
    uuid: Faker.random.uuid,
    debit: false,
    amount: Faker.finance.amount,
    pending: false,
    returned: false,
    cancelled: false,
    isCardTransaction: true,
    mcc: '1234',
    source: {
      name: Faker.name.firstName,
      legalNames: ['ilovekittens'],
    },
    created: () => moment().format('YYYY-MM-DD'),
    updated: () => moment().format('YYYY-MM-DD'),
    transactedAt: () => moment().format('YYYY-MM-DD'),
  });
}
