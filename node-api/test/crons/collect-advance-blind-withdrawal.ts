import * as sinon from 'sinon';
import { expect } from 'chai';
import { getAdvances, run } from '../../src/crons/collect-advance-blind-withdrawal';
import { clean, stubLoomisClient } from '../test-helpers';
import factory from '../factories';
import * as Tabapay from '../../src/lib/tabapay';
import { Payment } from '../../src/models';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { moment } from '@dave-inc/time-lib';

describe('collect-advance-blind-withdrawal', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  beforeEach(() => stubLoomisClient(sandbox));

  afterEach(() => clean(sandbox));

  it('attempts collection using a debit card', async () => {
    const debitCard = await factory.create('payment-method', {
      invalid: null,
      invalidReasonCode: null,
      deleted: null,
    });

    const advance = await factory.create('advance', {
      paybackDate: '2018-08-01',
      amount: 50,
      outstanding: 50,
      paybackFrozen: false,
      disbursementStatus: ExternalTransactionStatus.Completed,
      userId: debitCard.userId,
      paymentMethodId: debitCard.id,
    });

    const [account] = await Promise.all([
      advance.getBankAccount(),
      factory.create('advance-tip', { advanceId: advance.id, amount: 0 }),
    ]);

    const connection = await account.getBankConnection();

    await connection.update({ hasValidCredentials: false });

    sandbox.stub(Tabapay, 'retrieve').resolves({
      status: 'COMPLETED',
      id: 'foo-bar',
    });

    await run();

    const [payment] = await Promise.all([
      Payment.findOne({ where: { advanceId: advance.id } }),
      advance.reload(),
    ]);

    expect(advance.outstanding).to.equal(0);
    expect(payment.amount).to.equal(50);
    expect(payment.paymentMethodId).to.equal(debitCard.id);
  });

  it('excludes advances without valid debit cards', async () => {
    const debitCard = await factory.create('payment-method', {
      invalid: moment(),
      invalidReasonCode: 14,
      deleted: null,
    });

    const advance = await factory.create('advance', {
      paybackDate: '2018-08-01',
      amount: 50,
      outstanding: 50,
      paybackFrozen: false,
      disbursementStatus: ExternalTransactionStatus.Completed,
      userId: debitCard.userId,
      paymentMethodId: debitCard.id,
    });

    const account = await advance.getBankAccount();
    const connection = await account.getBankConnection();

    await connection.update({ hasValidCredentials: false });

    const advances = await getAdvances(10, 0);

    expect(advances.length).to.equal(0);
  });

  it('excludes advances where payback is frozen', async () => {
    const debitCard = await factory.create('payment-method', {
      invalid: null,
      invalidReasonCode: null,
      deleted: null,
    });

    const advance = await factory.create('advance', {
      paybackDate: '2018-08-01',
      amount: 50,
      outstanding: 50,
      paybackFrozen: true,
      disbursementStatus: ExternalTransactionStatus.Completed,
      userId: debitCard.userId,
      paymentMethodId: debitCard.id,
    });

    const account = await advance.getBankAccount();
    const connection = await account.getBankConnection();

    await connection.update({ hasValidCredentials: false });

    const advances = await getAdvances(10, 0);

    expect(advances.length).to.equal(0);
  });

  it('excludes users with valid bank connections', async () => {
    const debitCard = await factory.create('payment-method', {
      invalid: null,
      invalidReasonCode: null,
      deleted: null,
    });

    const advance = await factory.create('advance', {
      paybackDate: '2018-08-01',
      amount: 50,
      outstanding: 50,
      paybackFrozen: false,
      disbursementStatus: ExternalTransactionStatus.Completed,
      userId: debitCard.userId,
      paymentMethodId: debitCard.id,
    });

    const account = await advance.getBankAccount();
    const connection = await account.getBankConnection();

    await connection.update({ hasValidCredentials: true });

    const advances = await getAdvances(10, 0);

    expect(advances.length).to.equal(0);
  });

  it('excludes advances in the last batch', async () => {
    const debitCard = await factory.create('payment-method', {
      invalid: null,
      invalidReasonCode: null,
      deleted: null,
    });

    const advance = await factory.create('advance', {
      paybackDate: '2018-08-01',
      amount: 50,
      outstanding: 50,
      paybackFrozen: false,
      disbursementStatus: ExternalTransactionStatus.Completed,
      userId: debitCard.userId,
      paymentMethodId: debitCard.id,
    });

    const account = await advance.getBankAccount();
    const connection = await account.getBankConnection();

    await connection.update({ hasValidCredentials: false });

    const advances = await getAdvances(10, 0, [advance]);

    expect(advances.length).to.equal(0);
  });
});
