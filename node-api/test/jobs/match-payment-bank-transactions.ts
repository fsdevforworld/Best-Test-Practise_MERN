import { Job } from 'bull';
import { expect } from 'chai';

import factory from '../factories';
import { MatchPaymentBankTransaction } from '../../src/jobs';
import { moment } from '@dave-inc/time-lib';
import { Payment } from '../../src/models';
import * as sinon from 'sinon';
import stubBankTransactionClient from '../test-helpers/stub-bank-transaction-client';
import { clean } from '../test-helpers';

describe('Match payment bank transaction job', () => {
  const sandbox = sinon.createSandbox();
  before(async () => {
    stubBankTransactionClient(sandbox);
  });
  beforeEach(() => clean());
  after(() => {
    sandbox.restore();
  });
  it('should match a bank transaction to a same-day payment', async () => {
    const today = moment()
      .startOf('day')
      .format('YYYY-MM-DD');
    const bankAccount = await factory.create('checking-account');
    const advance = await factory.create('advance', _ids(bankAccount));
    const payment = await factory.create('payment', {
      ..._ids(bankAccount),
      advanceId: advance.id,
      amount: 55.55,
      created: today,
    });
    const bankTransaction = await factory.create('bank-transaction', {
      ..._ids(bankAccount),
      amount: -55.55,
      displayName: 'dave',
      transactionDate: today,
    });
    const job = {
      data: { bankConnectionId: bankAccount.bankConnectionId, userId: bankAccount.userId },
    } as Job;
    await MatchPaymentBankTransaction.process(job);
    const freshPayment = await Payment.findByPk(payment.id);
    expect(freshPayment.bankTransactionId).to.equal(bankTransaction.id);
  });

  it('should set bank transaction uuid if provided on the bank transaction', async () => {
    const today = moment()
      .startOf('day')
      .format('YYYY-MM-DD');
    const bankAccount = await factory.create('checking-account');
    const advance = await factory.create('advance', _ids(bankAccount));
    const payment = await factory.create('payment', {
      ..._ids(bankAccount),
      advanceId: advance.id,
      amount: 55.55,
      created: today,
    });
    const bankTransaction = await factory.create('bank-transaction', {
      ..._ids(bankAccount),
      amount: -55.55,
      displayName: 'dave',
      transactionDate: today,
      id: null,
      bankTransactionUuid: 'bacon',
    });
    const job = {
      data: { bankConnectionId: bankAccount.bankConnectionId, userId: bankAccount.userId },
    } as Job;
    await MatchPaymentBankTransaction.process(job);
    const freshPayment = await Payment.findByPk(payment.id);
    expect(freshPayment.bankTransactionUuid).to.equal(bankTransaction.bankTransactionUuid);
  });

  it('should match a bank transaction to a same-day payment through a payment method', async () => {
    const today = moment()
      .startOf('day')
      .format('YYYY-MM-DD');
    const bankAccount = await factory.create('checking-account');
    const advance = await factory.create('advance', _ids(bankAccount));
    const paymentMethod = await factory.create('payment-method', _ids(bankAccount));
    const payment = await factory.create('payment', {
      userId: bankAccount.userId,
      advanceId: advance.id,
      amount: 55.55,
      created: today,
      paymentMethodId: paymentMethod.id,
    });
    const bankTransaction = await factory.create('bank-transaction', {
      ..._ids(bankAccount),
      amount: -55.55,
      displayName: 'dave',
      transactionDate: today,
    });

    const job = {
      data: { bankConnectionId: bankAccount.bankConnectionId, userId: bankAccount.userId },
    } as Job;
    await MatchPaymentBankTransaction.process(job);
    const freshPayment = await Payment.findByPk(payment.id);
    expect(freshPayment.bankTransactionId).to.equal(bankTransaction.id);
  });

  it('should not match a bank transaction from another account', async () => {
    const today = moment()
      .startOf('day')
      .format('YYYY-MM-DD');
    const bankAccount1 = await factory.create('checking-account');
    const bankAccount2 = await factory.create('checking-account', {
      userId: bankAccount1.userId,
    });
    await bankAccount2.update({ bankConnectionId: bankAccount1.bankConnectionId });
    const advance = await factory.create('advance', _ids(bankAccount1));
    const payment = await factory.create('payment', {
      ..._ids(bankAccount1),
      advanceId: advance.id,
      amount: 55.55,
      created: today,
    });
    await factory.create('bank-transaction', {
      ..._ids(bankAccount2),
      amount: -55.55,
      displayName: 'dave',
      transactionDate: today,
    });
    const job = {
      data: { bankConnectionId: bankAccount1.bankConnectionId, userId: bankAccount1.userId },
    } as Job;
    await MatchPaymentBankTransaction.process(job);
    const freshPayment = await Payment.findByPk(payment.id);
    expect(freshPayment.bankTransactionId).to.be.null;
  });

  it('should not match a bank transaction with wrong amount', async () => {
    const today = moment()
      .startOf('day')
      .format('YYYY-MM-DD');
    const bankAccount = await factory.create('checking-account');
    const advance = await factory.create('advance', _ids(bankAccount));
    const payment = await factory.create('payment', {
      ..._ids(bankAccount),
      advanceId: advance.id,
      amount: 55.55,
      created: today,
    });
    await factory.create('bank-transaction', {
      ..._ids(bankAccount),
      amount: -55.54,
      displayName: 'dave',
      transactionDate: today,
    });
    const job = {
      data: { bankConnectionId: bankAccount.bankConnectionId, userId: bankAccount.userId },
    } as Job;
    await MatchPaymentBankTransaction.process(job);
    const freshPayment = await Payment.findByPk(payment.id);
    expect(freshPayment.bankTransactionId).to.be.null;
  });

  it('should match a bank transaction 6 days after a payment', async () => {
    const today = moment()
      .startOf('day')
      .format('YYYY-MM-DD');
    const bankAccount = await factory.create('checking-account');
    const advance = await factory.create('advance', _ids(bankAccount));
    const payment = await factory.create('payment', {
      ..._ids(bankAccount),
      advanceId: advance.id,
      amount: 55.55,
      created: today,
    });
    const bankTransaction = await factory.create('bank-transaction', {
      ..._ids(bankAccount),
      amount: -55.55,
      displayName: 'dave',
      transactionDate: moment(today).add(6, 'days'),
    });
    const job = {
      data: { bankConnectionId: bankAccount.bankConnectionId, userId: bankAccount.userId },
    } as Job;
    await MatchPaymentBankTransaction.process(job);
    const freshPayment = await Payment.findByPk(payment.id);
    expect(freshPayment.bankTransactionId).to.equal(bankTransaction.id);
  });

  it('should not match a bank transaction earlier than a payment', async () => {
    const today = moment()
      .startOf('day')
      .format('YYYY-MM-DD');
    const bankAccount = await factory.create('checking-account');
    const advance = await factory.create('advance', _ids(bankAccount));
    const payment = await factory.create('payment', {
      ..._ids(bankAccount),
      advanceId: advance.id,
      amount: 55.55,
      created: today,
    });
    await factory.create('bank-transaction', {
      ..._ids(bankAccount),
      amount: -55.55,
      displayName: 'dave',
      transactionDate: moment(today).subtract(1, 'days'),
    });
    const job = {
      data: { bankConnectionId: bankAccount.bankConnectionId, userId: bankAccount.userId },
    } as Job;
    await MatchPaymentBankTransaction.process(job);
    const freshPayment = await Payment.findByPk(payment.id);
    expect(freshPayment.bankTransactionId).to.be.null;
  });

  it('should not match a bank transaction 7 days after a payment', async () => {
    const today = moment()
      .startOf('day')
      .format('YYYY-MM-DD');
    const bankAccount = await factory.create('checking-account');
    const advance = await factory.create('advance', _ids(bankAccount));
    const payment = await factory.create('payment', {
      ..._ids(bankAccount),
      advanceId: advance.id,
      amount: 55.55,
      created: today,
    });
    await factory.create('bank-transaction', {
      ..._ids(bankAccount),
      amount: -55.55,
      displayName: 'dave',
      transactionDate: moment(today).add(7, 'days'),
    });
    const job = {
      data: { bankConnectionId: bankAccount.bankConnectionId, userId: bankAccount.userId },
    } as Job;
    await MatchPaymentBankTransaction.process(job);
    const freshPayment = await Payment.findByPk(payment.id);
    expect(freshPayment.bankTransactionId).to.be.null;
  });

  it('should match the earliest of two eligible bank transactions to a payment', async () => {
    const today = moment()
      .startOf('day')
      .format('YYYY-MM-DD');
    const bankAccount = await factory.create('checking-account');
    const advance = await factory.create('advance', _ids(bankAccount));
    const payment = await factory.create('payment', {
      ..._ids(bankAccount),
      advanceId: advance.id,
      amount: 55.55,
      created: today,
    });
    await factory.create('bank-transaction', {
      ..._ids(bankAccount),
      amount: -55.55,
      displayName: 'dave',
      transactionDate: moment(today).add(1, 'day'),
    });
    const bankTransaction1 = await factory.create('bank-transaction', {
      ..._ids(bankAccount),
      amount: -55.55,
      displayName: 'dave',
      transactionDate: today,
    });
    const job = {
      data: { bankConnectionId: bankAccount.bankConnectionId, userId: bankAccount.userId },
    } as Job;
    await MatchPaymentBankTransaction.process(job);
    const freshPayment = await Payment.findByPk(payment.id);
    expect(freshPayment.bankTransactionId).to.equal(bankTransaction1.id);
  });

  it('should match two earliest eligible bank transactions to two earliest payments', async () => {
    const today = moment()
      .startOf('day')
      .format('YYYY-MM-DD');
    const bankAccount = await factory.create('checking-account');
    const advance = await factory.create('advance', _ids(bankAccount));
    const payment2 = await factory.create('payment', {
      ..._ids(bankAccount),
      advanceId: advance.id,
      amount: 55.55,
      created: moment(today).add(1, 'day'),
    });
    const payment1 = await factory.create('payment', {
      ..._ids(bankAccount),
      advanceId: advance.id,
      amount: 55.55,
      created: today,
    });
    const bankTransaction2 = await factory.create('bank-transaction', {
      ..._ids(bankAccount),
      amount: -55.55,
      displayName: 'dave',
      transactionDate: moment(today).add(3, 'day'),
    });
    const bankTransaction1 = await factory.create('bank-transaction', {
      ..._ids(bankAccount),
      amount: -55.55,
      displayName: 'dave',
      transactionDate: moment(today).add(2, 'day'),
    });
    const job = {
      data: { bankConnectionId: bankAccount.bankConnectionId, userId: bankAccount.userId },
    } as Job;
    await MatchPaymentBankTransaction.process(job);
    const freshPayment1 = await Payment.findByPk(payment1.id);
    const freshPayment2 = await Payment.findByPk(payment2.id);
    expect(freshPayment1.bankTransactionId).to.equal(bankTransaction1.id);
    expect(freshPayment2.bankTransactionId).to.equal(bankTransaction2.id);
  });

  it('should not match an eligible bank transaction to a spoken-for payment', async () => {
    const today = moment()
      .startOf('day')
      .format('YYYY-MM-DD');
    const bankAccount = await factory.create('checking-account');
    const bankTransaction1 = await factory.create('bank-transaction', {
      ..._ids(bankAccount),
      amount: -55.55,
      displayName: 'dave',
      transactionDate: today,
    });
    const advance = await factory.create('advance', _ids(bankAccount));
    const payment = await factory.create('payment', {
      ..._ids(bankAccount),
      advanceId: advance.id,
      amount: 55.55,
      bankTransactionId: bankTransaction1.id,
      created: today,
    });
    await factory.create('bank-transaction', {
      ..._ids(bankAccount),
      amount: -55.55,
      displayName: 'dave',
      transactionDate: today,
    });
    const job = {
      data: { bankConnectionId: bankAccount.bankConnectionId, userId: bankAccount.userId },
    } as Job;
    await MatchPaymentBankTransaction.process(job);
    const freshPayment = await Payment.findByPk(payment.id);
    expect(freshPayment.bankTransactionId).to.equal(bankTransaction1.id);
  });

  it('should not match a bank transaction to more than one payment in one sweep', async () => {
    const today = moment()
      .startOf('day')
      .format('YYYY-MM-DD');
    const bankAccount = await factory.create('checking-account');
    const advance = await factory.create('advance', _ids(bankAccount));
    const payment1 = await factory.create('payment', {
      ..._ids(bankAccount),
      advanceId: advance.id,
      amount: 55.55,
      created: today,
    });
    const payment2 = await factory.create('payment', {
      ..._ids(bankAccount),
      advanceId: advance.id,
      amount: 55.55,
      created: moment(today).add(1, 'day'),
    });
    const bankTransaction = await factory.create('bank-transaction', {
      ..._ids(bankAccount),
      amount: -55.55,
      displayName: 'dave',
      transactionDate: today,
    });
    const job = {
      data: { bankConnectionId: bankAccount.bankConnectionId, userId: bankAccount.userId },
    } as Job;
    await MatchPaymentBankTransaction.process(job);
    const freshPayment1 = await Payment.findByPk(payment1.id);
    const freshPayment2 = await Payment.findByPk(payment2.id);
    expect(freshPayment1.bankTransactionId).to.equal(bankTransaction.id);
    expect(freshPayment2.bankTransactionId).to.be.null;
  });

  it('should not match a bank transaction to more than one payment in two sweeps', async () => {
    const today = moment()
      .startOf('day')
      .format('YYYY-MM-DD');
    const bankAccount = await factory.create('checking-account');
    const advance = await factory.create('advance', _ids(bankAccount));
    const payment1 = await factory.create('payment', {
      ..._ids(bankAccount),
      advanceId: advance.id,
      amount: 55.55,
      created: today,
    });
    const payment2 = await factory.create('payment', {
      ..._ids(bankAccount),
      advanceId: advance.id,
      amount: 55.55,
      created: moment(today).add(1, 'day'),
    });
    const bankTransaction = await factory.create('bank-transaction', {
      ..._ids(bankAccount),
      amount: -55.55,
      displayName: 'dave',
      transactionDate: today,
    });
    const job = {
      data: { bankConnectionId: bankAccount.bankConnectionId, userId: bankAccount.userId },
    } as Job;
    await MatchPaymentBankTransaction.process(job);
    await MatchPaymentBankTransaction.process(job);
    const freshPayment1 = await Payment.findByPk(payment1.id);
    const freshPayment2 = await Payment.findByPk(payment2.id);
    expect(freshPayment1.bankTransactionId).to.equal(bankTransaction.id);
    expect(freshPayment2.bankTransactionId).to.be.null;
  });
});

type Ids = {
  bankAccountId: number;
  userId: number;
};

function _ids(bankAccount: any): Ids {
  return {
    bankAccountId: bankAccount.id,
    userId: bankAccount.userId,
  };
}
