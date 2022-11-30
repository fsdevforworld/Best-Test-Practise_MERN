import { DefaultAdapter } from 'factory-girl';
import * as Faker from 'faker';
import { moment } from '@dave-inc/time-lib';

export default function(factory: any) {
  factory.setAdapter(new DefaultAdapter(), 'bds-bank-transaction');
  factory.define('bds-bank-transaction', Object, {
    userId: factory.assoc('user', 'id'),
    bankAccountId: factory.assoc('checking-account', 'id'),
    amount: () => parseFloat(Faker.finance.amount(-1000, 2000)),
    displayName: () => Faker.random.words(3),
    externalName: () => Faker.random.words(3),
    pendingDisplayName: () => Faker.random.words(3),
    pendingExternalName: () => Faker.random.words(3),
    plaidCategory: () => [Faker.random.word(), Faker.random.word()],
    plaidCategoryId: () => Faker.random.number().toString(),
    merchantInfoId: factory.assoc('merchant-info', 'id'),
    transactionDate: () => moment(Faker.date.past()).format('YYYY-MM-DD'),
    externalId: () => Faker.random.uuid(),
    pending: false,
  });
}
