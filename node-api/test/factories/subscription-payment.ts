import * as Faker from 'faker';
import { SubscriptionPayment } from '../../src/models';

export default function(factory: any) {
  factory.define(
    'subscription-payment',
    SubscriptionPayment,
    {
      bankAccountId: factory.assoc('checking-account'),
      amount: 1,
      externalProcessor: 'RISEPAY',
      externalId: () => Faker.random.alphaNumeric(8),
      status: 'COMPLETED',
    },
    {
      afterBuild: async (model: any, attrs: any, buildOptions: any) => {
        if (model.bankAccountId && typeof model.bankAccountId !== 'number') {
          const bankAccount = model.bankAccountId;

          model.userId = attrs.userId || bankAccount.userId;
          model.bankAccountId = attrs.bankAccountId || bankAccount.id;
        }

        return model;
      },
      afterCreate: async (model: any) => {
        await factory.create('subscription-payment-line-item', { subscriptionPaymentId: model.id });

        return model;
      },
    },
  );
}
