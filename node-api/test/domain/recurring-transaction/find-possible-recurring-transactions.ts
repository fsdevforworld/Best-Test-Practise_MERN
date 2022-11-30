import factory from '../../factories';
import { expect } from 'chai';
import { moment } from '@dave-inc/time-lib';
import { findSingleIncomeTransactions } from '../../../src/domain/recurring-transaction/find-possible-recurring-transactions';
import { MINIMUM_SINGLE_TRANSACTION_INCOME_AMOUNT } from '../../../src/domain/recurring-transaction/constants';
import { clean } from '../../test-helpers';

describe('RecurringTransactionDomain find possible recurring transactions', () => {
  before(() => clean());

  afterEach(() => clean());

  it('should find one-off incomes', async () => {
    const bankAccount = await factory.create('checking-account');
    await factory.create('bank-transaction', {
      bankAccountId: bankAccount.id,
      amount: 500,
      displayName: 'dollah',
      transactionDate: moment('2020-01-15'),
    });
    await factory.create('bank-transaction', {
      bankAccountId: bankAccount.id,
      amount: 500,
      displayName: 'dollah',
      transactionDate: moment('2020-01-30'),
    });
    await factory.create('bank-transaction', {
      bankAccountId: bankAccount.id,
      amount: 500,
      displayName: 'billz',
      transactionDate: moment('2020-01-30'),
    });
    await factory.create('bank-transaction', {
      bankAccountId: bankAccount.id,
      amount: 500,
      displayName: "y'all",
      transactionDate: moment('2020-01-15'),
    });

    const singleTransactionIncomes = await findSingleIncomeTransactions(
      bankAccount.id,
      moment('2020-02-10'),
    );

    expect(singleTransactionIncomes.length).to.equal(2);
    const names = singleTransactionIncomes.map(income => income.displayName);
    expect(names).to.include('billz');
    expect(names).to.include("y'all");
  });

  it('should exclude income transactions below limit', async () => {
    const bankAccount = await factory.create('checking-account');
    await factory.create('bank-transaction', {
      bankAccountId: bankAccount.id,
      amount: MINIMUM_SINGLE_TRANSACTION_INCOME_AMOUNT - 10,
      displayName: 'dollah',
      transactionDate: moment('2020-01-15'),
    });
    const singleTransactionIncomes = await findSingleIncomeTransactions(
      bankAccount.id,
      moment('2020-02-10'),
    );

    expect(singleTransactionIncomes).to.be.empty;
  });

  it('should exclude income transactions outside of search period', async () => {
    const bankAccount = await factory.create('checking-account');
    await factory.create('bank-transaction', {
      bankAccountId: bankAccount.id,
      amount: 500,
      displayName: 'dollah',
      transactionDate: moment('2019-10-15'),
    });
    const singleTransactionIncomes = await findSingleIncomeTransactions(
      bankAccount.id,
      moment('2020-02-10'),
    );

    expect(singleTransactionIncomes).to.be.empty;
  });
});
