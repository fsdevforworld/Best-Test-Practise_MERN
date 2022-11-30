import * as Faker from 'faker';
import { RecurringTransaction } from '../../src/models';

export default function(factory: any) {
  factory.define(
    'recurring-transaction',
    RecurringTransaction,
    {
      bankAccountId: factory.assoc('checking-account'),
      transactionDisplayName: () => Faker.hacker.phrase(),
      params: [1],
      dtstart: new Date(),
      interval: 'MONTHLY',
      userDisplayName: () => Faker.hacker.phrase(),
      userAmount: () => Faker.finance.amount(-1000, 2000),
      status: 'VALID',
    },
    {
      afterBuild: (model: any) => {
        if (typeof model.bankAccountId !== 'number' && model.bankAccountId) {
          const bankAccount = model.bankAccountId;
          model.userId = bankAccount.userId;
          model.bankAccountId = bankAccount.id;
        }

        return model;
      },
    },
  );
}
