import 'mocha';
import { expect } from 'chai';
import factory from '../../factories';
import { ExpectedTransaction, RecurringTransaction } from '../../../src/models';
import { moment } from '@dave-inc/time-lib';
import {
  getMatchByAmount,
  getMatchByName,
  scoreBankTransactions,
} from '../../../src/domain/recurring-transaction/match-quality-score';
import * as sinon from 'sinon';
import stubBankTransactionClient from '../../test-helpers/stub-bank-transaction-client';

describe('Recurring transaction match quality scoring', () => {
  const sandbox = sinon.createSandbox();
  before(() => stubBankTransactionClient(sandbox));
  after(() => sandbox.restore());
  it('find best transaction match by name', async () => {
    const transactionDisplayName = 'some regular transaction';
    const expected: ExpectedTransaction = await factory.create('expected-paycheck', {
      expectedDate: moment().subtract(3, 'days'),
    });
    const transactions = [
      await factory.create('bank-transaction', {
        id: 1000,
        displayName: 'some regular transaction',
      }),
      await factory.create('bank-transaction', {
        id: 1001,
        displayName: 'another regular transaction',
      }),
    ];

    const result = getMatchByName(expected, transactions, transactionDisplayName);
    expect(result.id).to.be.equal(1000);
  });

  it('find best transaction match by amount', async () => {
    const recurring: RecurringTransaction = await factory.create('recurring-transaction', {
      transactionDisplayName: 'some regular transaction',
    });
    const expected: ExpectedTransaction = await factory.create('expected-paycheck', {
      expectedDate: moment().subtract(3, 'days'),
      expectedAmount: 500,
    });
    const transactions = [
      await factory.create('bank-transaction', {
        id: 1400,
        amount: 480,
      }),
      await factory.create('bank-transaction', {
        id: 1401,
        amount: 515,
      }),
    ];

    const result = await getMatchByAmount(expected, recurring, transactions);
    expect(result.id).to.be.equal(1401);
  });

  it('transaction match tie breaks by date', async () => {
    const date = moment().subtract(3, 'days');
    const expected: ExpectedTransaction = await factory.create('expected-paycheck', {
      expectedDate: date,
    });
    const transactions = [
      await factory.create('bank-transaction', {
        id: 1402,
        transactionDate: date.clone().subtract(3, 'days'),
      }),
      await factory.create('bank-transaction', {
        id: 1403,
        transactionDate: date.clone(),
      }),
      await factory.create('bank-transaction', {
        id: 1404,
        transactionDate: date.clone().add(5, 'days'),
      }),
    ];

    const constantScoreFn = () => 1.0;
    const [result] = scoreBankTransactions(transactions, expected, constantScoreFn);
    expect(result.id).to.be.equal(1403);
  });
});
