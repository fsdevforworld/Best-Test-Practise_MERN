import { Advance } from '../../src/models';
import * as Faker from 'faker';

export default function(factory: any) {
  factory.define(
    'advance',
    Advance,
    {
      bankAccountId: factory.assoc('checking-account', 'id'),
      userId: factory.assoc('user', 'id'),
      amount: 75,
      outstanding: 75,
      disbursementStatus: 'COMPLETED',
      paybackDate: () => Faker.date.future(1),
      referenceId: () => Faker.random.alphaNumeric(16),
    },
    {
      afterBuild: (model: any, attrs: any, buildOptions: any) => {
        if (model.bankAccountId && typeof model.bankAccountId !== 'number') {
          const bankAccount = model.bankAccountId;

          model.userId = attrs.userId || bankAccount.userId;
          model.bankAccountId = attrs.bankAccountId || bankAccount.id;
        }

        return model;
      },
    },
  );
}
