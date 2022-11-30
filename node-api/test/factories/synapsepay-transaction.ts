import { DefaultAdapter } from 'factory-girl';
import * as Faker from 'faker';

export default function(factory: any) {
  factory.setAdapter(new DefaultAdapter(), 'synapsepay-transaction');
  factory.define('synapsepay-transaction', Object, {
    _id: () => Faker.random.alphaNumeric(16),

    _self: () => {
      return {
        self: {
          href: Faker.internet.url(),
        },
      };
    },

    amount: () => {
      return {
        amount: Faker.finance.amount(0, 500, 2),
        currency: 'USD',
      };
    },

    client: () => {
      return {
        id: Faker.random.alphaNumeric(16),
        name: Faker.company.companyName(),
      };
    },

    extra: () => {
      return {};
    },

    fees(): any[] {
      return [];
    },

    from: () => {
      return {};
    },

    recent_status: () => {
      return {};
    },

    timeline(): any[] {
      return [];
    },

    to: () => {
      return {};
    },
  });
}
