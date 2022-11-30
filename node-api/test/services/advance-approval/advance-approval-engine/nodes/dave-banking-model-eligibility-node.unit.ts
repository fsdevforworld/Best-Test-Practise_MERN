import { expect } from 'chai';
import { BankTransaction } from '@dave-inc/heath-client';
import { moment } from '@dave-inc/time-lib';
import { RecurringTransactionInterval } from '@dave-inc/wire-typings';
import { RecurringTransaction } from '../../../../../src/services/advance-approval/recurring-transaction-client';
import DaveBankingModelEligibilityNode from '../../../../../src/services/advance-approval/advance-approval-engine/nodes/dave-banking-model-eligibility-node';

describe('DaveBankingModelEligibilityNode', () => {
  it('should validate income of > $1000 per month', () => {
    const mockRT = {
      rsched: { interval: RecurringTransactionInterval.WEEKLY },
    } as RecurringTransaction;
    const paychecks = [
      {
        amount: 90,
        transactionDate: '2021-02-03',
      },
      {
        amount: 270,
        transactionDate: '2021-02-10',
      },
      {
        amount: 550,
        transactionDate: '2021-02-17',
      },
      {
        amount: 100,
        transactionDate: '2021-02-24',
      },
    ] as BankTransaction[];

    const result = DaveBankingModelEligibilityNode.performIncomeCheck(
      mockRT,
      paychecks,
      moment('2021-03-01'),
    );
    expect(result.paycheckAmounts).to.deep.equal([90, 270, 550, 100]);
    expect(result.monthTotalAmount).to.equal(1010);
    expect(result.checkFailure).to.not.exist;
  });

  it('should not mark income eligible with only one paycheck', () => {
    const mockRT = {
      rsched: { interval: RecurringTransactionInterval.SEMI_MONTHLY },
    } as RecurringTransaction;
    const paychecks = [
      {
        amount: 9999,
        transactionDate: '2021-02-15',
      },
    ] as BankTransaction[];

    const result = DaveBankingModelEligibilityNode.performIncomeCheck(
      mockRT,
      paychecks,
      moment('2021-03-01'),
    );
    expect(result.paycheckAmounts).to.not.exist;
    expect(result.monthTotalAmount).to.not.exist;
    expect(result.checkFailure).to.exist;
  });

  it('should not mark Monthly income eligible with previous month less than $1000', () => {
    const mockRT = {
      rsched: { interval: RecurringTransactionInterval.MONTHLY },
    } as RecurringTransaction;
    const paychecks = [
      {
        amount: 9999,
        transactionDate: '2021-02-15',
      },
      {
        amount: 999,
        transactionDate: '2021-01-15',
      },
    ] as BankTransaction[];

    const result = DaveBankingModelEligibilityNode.performIncomeCheck(
      mockRT,
      paychecks,
      moment('2021-03-01'),
    );
    expect(result.paycheckAmounts).to.deep.equal([999, 9999]);
    expect(result.monthTotalAmount).to.equal(9999);
    expect(result.checkFailure).to.exist;
  });

  it('should mark Monthly income eligible with previous month more than $1000', () => {
    const mockRT = {
      rsched: { interval: RecurringTransactionInterval.MONTHLY },
    } as RecurringTransaction;
    const paychecks = [
      {
        amount: 9999,
        transactionDate: '2021-02-15',
      },
      {
        amount: 9999,
        transactionDate: '2021-01-15',
      },
    ] as BankTransaction[];

    const result = DaveBankingModelEligibilityNode.performIncomeCheck(
      mockRT,
      paychecks,
      moment('2021-03-01'),
    );
    expect(result.paycheckAmounts).to.deep.equal([9999, 9999]);
    expect(result.monthTotalAmount).to.equal(9999);
    expect(result.checkFailure).to.not.exist;
  });

  it('should only consider paychecks in last month', () => {
    const mockRT = {
      rsched: { interval: RecurringTransactionInterval.SEMI_MONTHLY },
    } as RecurringTransaction;
    const paychecks = [
      {
        amount: 320,
        transactionDate: '2021-01-03',
      },
      {
        amount: 310,
        transactionDate: '2021-01-15',
      },
      {
        amount: 299,
        transactionDate: '2021-02-03',
      },
      {
        amount: 300,
        transactionDate: '2021-02-15',
      },
    ] as BankTransaction[];

    const result = DaveBankingModelEligibilityNode.performIncomeCheck(
      mockRT,
      paychecks,
      moment('2021-03-01'),
    );
    expect(result.paycheckAmounts).to.deep.equal([299, 300]);
    expect(result.monthTotalAmount).to.equal(599);
    expect(result.checkFailure).to.exist;
  });

  it('should fail if most recent check is too old', () => {
    const mockRT = {
      rsched: { interval: RecurringTransactionInterval.SEMI_MONTHLY },
    } as RecurringTransaction;
    const paychecks = [
      {
        amount: 999,
        transactionDate: '2021-01-11',
      },
      {
        amount: 1100,
        transactionDate: '2021-01-25',
      },
    ] as BankTransaction[];

    const result = DaveBankingModelEligibilityNode.performIncomeCheck(
      mockRT,
      paychecks,
      moment('2021-03-01'),
    );
    expect(result.checkFailure).to.exist;
  });

  it('should not incldue recent paychecks that just older than a month', () => {
    const mockRT = {
      rsched: { interval: RecurringTransactionInterval.WEEKLY },
    } as RecurringTransaction;
    const paychecks = [
      {
        amount: 200,
        transactionDate: '2021-02-28',
      },
      {
        amount: 200,
        transactionDate: '2021-02-21',
      },
      {
        amount: 200,
        transactionDate: '2021-02-14',
      },
      {
        amount: 200,
        transactionDate: '2021-02-07',
      },
      {
        amount: 200,
        transactionDate: '2021-01-31',
      },
    ] as BankTransaction[];

    const result = DaveBankingModelEligibilityNode.performIncomeCheck(
      mockRT,
      paychecks,
      moment('2021-03-01'),
    );
    expect(result.checkFailure).to.exist;
  });
});
