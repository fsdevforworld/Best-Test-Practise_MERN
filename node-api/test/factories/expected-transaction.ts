import * as Faker from 'faker';
import { moment } from '@dave-inc/time-lib';
import { ExpectedTransaction } from '../../src/models';

export default function(factory: any) {
  factory.define(
    'expected-transaction',
    ExpectedTransaction,
    {
      displayName: () => Faker.finance.accountName(),
      bankAccountId: factory.assoc('checking-account'),
      type: 'EXPENSE',
      expectedDate: () => moment().format('YYYY-MM-DD'),
      expectedAmount: () => Faker.finance.amount(-1000, 2000),
    },
    {
      afterBuild: (model: any, attrs: any, buildOptions: any) => {
        if (typeof model.bankAccountId !== 'number') {
          const bankAccount = model.bankAccountId;

          model.userId = attrs.userId || bankAccount.userId;
          model.bankAccountId = attrs.bankAccountId || bankAccount.id;
        }

        return model;
      },
    },
  );

  factory.extend(
    'expected-transaction',
    'expected-paycheck',
    {
      type: 'INCOME',
      expectedAmount: () => Faker.finance.amount(1, 2000),
    },
    {
      afterBuild: (model: any, attrs: any, buildOptions: any) => {
        if (typeof model.bankAccountId !== 'number') {
          const bankAccount = model.bankAccountId;

          model.userId = attrs.userId || bankAccount.userId;
          model.bankAccountId = attrs.bankAccountId || bankAccount.id;
        }

        return model;
      },
    },
  );
}
