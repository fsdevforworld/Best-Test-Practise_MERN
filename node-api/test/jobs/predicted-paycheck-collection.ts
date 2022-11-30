import { clean, stubLoomisClient } from '../test-helpers';
import factory from '../factories';
import { moment } from '@dave-inc/time-lib';
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as Tabapay from '../../src/lib/tabapay';
import { performPredictedPaycheckCollection } from '../../src/jobs/handlers';
import { PredictedPaycheckCollectionData } from '../../src/jobs/data';
import { Payment } from '../../src/models';

describe('Predicted paycheck collection job', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  beforeEach(() => stubLoomisClient(sandbox));

  afterEach(() => clean(sandbox));

  it('creates a debit card payment', async () => {
    const debitCard = await factory.create('payment-method');
    const currentWeekDay = moment()
      .format('dddd')
      .toLowerCase();
    const paycheck = await factory.create('recurring-transaction', {
      bankAccountId: debitCard.bankAccountId,
      userId: debitCard.userId,
      userAmount: 1000,
      transactionDisplayName: 'My Paycheck',
      interval: 'weekly',
      params: [currentWeekDay],
    });

    const advance = await factory.create('advance', {
      amount: 75,
      outstanding: 75,
      bankAccountId: debitCard.bankAccountId,
      userId: debitCard.userId,
      paymentMethodId: debitCard.id,
    });

    await factory.create('advance-tip', { advanceId: advance.id });

    const data: PredictedPaycheckCollectionData = {
      advanceId: advance.id,
      bankAccountId: debitCard.bankAccountId,
      recurringTransactionId: paycheck.id,
      achLimit: 0,
    };

    sandbox.stub(Tabapay, 'retrieve').resolves({ status: 'COMPLETED', id: 'foo' });

    await performPredictedPaycheckCollection(data);

    const paymentCount = await Payment.count({
      where: {
        paymentMethodId: debitCard.id,
        advanceId: advance.id,
        amount: 75,
      },
    });

    expect(paymentCount).to.equal(1);
  });

  it('does not attempt a charge if the predicted pay day is not today', async () => {
    const bankAccount = await factory.create('checking-account');
    let dateParam = moment()
      .subtract(1, 'day')
      .date();

    if (dateParam > 28) {
      dateParam = 15;
    }

    const paycheck = await factory.create('recurring-transaction', {
      bankAccountId: bankAccount.id,
      userId: bankAccount.userId,
      userAmount: 1000,
      transactionDisplayName: 'My Paycheck',
      interval: 'monthly',
      params: [dateParam],
    });

    const [debitCard] = await Promise.all([
      factory.create('payment-method', { bankAccountId: bankAccount.id }),
    ]);

    const advance = await factory.create('advance', {
      amount: 75,
      outstanding: 75,
      bankAccountId: bankAccount.id,
      paymentMethodId: debitCard.id,
    });

    const data: PredictedPaycheckCollectionData = {
      advanceId: advance.id,
      bankAccountId: bankAccount.id,
      recurringTransactionId: paycheck.id,
      achLimit: 0,
    };

    const externalPaymentStub = sandbox
      .stub(Tabapay, 'retrieve')
      .resolves({ status: 'COMPLETED', id: 'foo' });

    await performPredictedPaycheckCollection(data);

    sinon.assert.notCalled(externalPaymentStub);
  });
});
