import * as Faker from 'faker';
import { moment } from '@dave-inc/time-lib';
import { DefaultAdapter } from 'factory-girl';
import {
  deleteBankTransactionFromStore,
  upsertBankTransactionForStubs,
} from '../test-helpers/stub-bank-transaction-client';
import { BankAccount, BankTransaction as DBBankTransaction } from '../../src/models';
import { isMoment } from 'moment';
import logger from '../../src/lib/logger';

const options = (factory: any) => ({
  afterBuild: async (model: any, attrs: any, buildOptions: any) => {
    if (isMoment(model.transactionDate)) {
      model.transactionDate = model.transactionDate.ymd();
    }
    try {
      const bankAccount = await BankAccount.findByPk(model.bankAccountId);
      if (bankAccount) {
        model.userId = bankAccount.userId;
        model.bankAccountId = bankAccount.id;
      }
    } catch (err) {
      //ignore errors for unit test mode
      logger.info(
        'Caught Error in bank transaction factory-girl factory, this is expected in unit tests',
        { error: err.message },
      );
    }
    model.externalName = model.displayName;
    return model;
  },
});

class BankTransaction {
  [key: string]: any;

  constructor(props: any) {
    Object.keys(props).forEach(key => {
      this[key] = props[key];
    });
  }

  public async save() {
    const created = await DBBankTransaction.create(this);

    this.id = created.id;

    return upsertBankTransactionForStubs(this as any);
  }

  public async destroy() {
    deleteBankTransactionFromStore(this.bankAccountId, this.id);
    // just for now
    await DBBankTransaction.destroy({ where: { id: this.id } });
  }
}

export default function(factory: any) {
  factory.setAdapter(new DefaultAdapter(), 'bank-transaction');
  factory.define(
    'bank-transaction',
    BankTransaction,
    {
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
    },
    options(factory),
  );
}
