import { DefaultAdapter } from 'factory-girl';
import * as Faker from 'faker';

const FACTORY_NAME = 'dave-banking-pubsub-transaction';

export default function(factory: any) {
  factory.setAdapter(new DefaultAdapter(), FACTORY_NAME);
  factory.define(FACTORY_NAME, Object, {
    uuid: () => Faker.random.uuid(),
    debit: () => Faker.random.boolean(),
    amount: () => Faker.finance.amount(),
    pending: () => Faker.random.boolean(),
    source: () => ({
      name: Faker.name.findName(),
      legalNames: [Faker.name.findName()],
    }),
    transactedAt: () => Faker.date.recent().toISOString(),

    created: () => Faker.date.recent().toISOString(),
    updated: () => Faker.date.recent().toISOString(),
    returned: () => Faker.random.boolean(),
    cancelled: () => Faker.random.boolean(),
    mcc: () =>
      Faker.random.arrayElement([
        '0742',
        '0763',
        '3403',
        '3404',
        '3505',
        '3555',
        '4814',
        '4816',
        '4821',
        '5085',
        '5099',
      ]),
    isCardTransaction: () => Faker.random.boolean(),
  });
}
