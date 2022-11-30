import { expect } from 'chai';
import * as sinon from 'sinon';
import { moment } from '@dave-inc/time-lib';
import { subscriptionCollectionPredictedPayday } from '../../../src/jobs/handlers';
import * as Tabapay from '../../../src/lib/tabapay';
import factory from '../../factories';
import { clean, fakeDate, stubLoomisClient } from '../../test-helpers';
import { paymentUpdateEvent } from '../../../src/domain/event';

describe('subscription-collection-predicted-payday job', () => {
  let paymentUpdateEventStub: sinon.SinonStub;

  const sandbox = sinon.createSandbox();

  before(() => clean());

  beforeEach(() => {
    stubLoomisClient(sandbox);
    paymentUpdateEventStub = sandbox.stub(paymentUpdateEvent, 'publish').resolves();
  });

  afterEach(() => clean(sandbox));

  it('creates a debit card payment', async () => {
    fakeDate(sandbox, '2019-10-15');
    const debitCard = await factory.create('payment-method');

    const currentWeekDay = moment()
      .format('dddd')
      .toLowerCase();

    const expectedAmount = 1;

    const [bankAccount, paycheck, billing] = await Promise.all([
      debitCard.getBankAccount(),
      factory.create('recurring-transaction', {
        bankAccountId: debitCard.bankAccountId,
        userId: debitCard.userId,
        userAmount: 1000,
        transactionDisplayName: 'My Paycheck',
        interval: 'weekly',
        params: [currentWeekDay],
      }),
      factory.create('subscription-billing', {
        amount: expectedAmount,
        userId: debitCard.userId,
        dueDate: moment(),
      }),
    ]);

    await bankAccount.update({ defaultPaymentMethodId: debitCard.id });

    const data = {
      subscriptionBillingId: billing.id,
      bankAccountId: debitCard.bankAccountId,
      recurringTransactionId: paycheck.id,
    };

    const debitSpy = sandbox.stub(Tabapay, 'retrieve').resolves({ status: 'COMPLETED', id: 'foo' });

    await subscriptionCollectionPredictedPayday(data);

    sinon.assert.calledOnce(debitSpy);

    const isSubscription = true;
    sinon.assert.calledWith(
      debitSpy,
      sinon.match.string,
      sinon.match.string,
      expectedAmount,
      isSubscription,
    );

    const payments = await billing.getSubscriptionPayments();

    expect(payments.length).to.equal(1);
    sinon.assert.calledOnce(paymentUpdateEventStub);
  });

  it('does not charge when the next payday is after today', async () => {
    fakeDate(sandbox, '2019-10-15');
    const debitCard = await factory.create('payment-method');

    const tomorrow = moment()
      .add(1, 'day')
      .format('dddd')
      .toLowerCase();

    const expectedAmount = 1;

    const [bankAccount, paycheck, billing] = await Promise.all([
      debitCard.getBankAccount(),
      factory.create('recurring-transaction', {
        bankAccountId: debitCard.bankAccountId,
        userId: debitCard.userId,
        userAmount: 1000,
        transactionDisplayName: 'My Paycheck',
        interval: 'weekly',
        params: [tomorrow],
      }),
      factory.create('subscription-billing', {
        amount: expectedAmount,
        userId: debitCard.userId,
        dueDate: moment(),
      }),
    ]);

    await bankAccount.update({ defaultPaymentMethodId: debitCard.id });

    const data = {
      subscriptionBillingId: billing.id,
      bankAccountId: debitCard.bankAccountId,
      recurringTransactionId: paycheck.id,
    };

    const debitSpy = sandbox.stub(Tabapay, 'retrieve');

    await subscriptionCollectionPredictedPayday(data);

    sinon.assert.notCalled(debitSpy);

    const payments = await billing.getSubscriptionPayments();

    expect(payments).to.be.empty;
  });

  it('does not charge when the next payday is before today', async () => {
    fakeDate(sandbox, '2019-10-15');
    const debitCard = await factory.create('payment-method');

    const yesterday = moment()
      .subtract(1, 'day')
      .format('dddd')
      .toLowerCase();

    const expectedAmount = 1;

    const [bankAccount, paycheck, billing] = await Promise.all([
      debitCard.getBankAccount(),
      factory.create('recurring-transaction', {
        bankAccountId: debitCard.bankAccountId,
        userId: debitCard.userId,
        userAmount: 1000,
        transactionDisplayName: 'My Paycheck',
        interval: 'weekly',
        params: [yesterday],
      }),
      factory.create('subscription-billing', {
        amount: expectedAmount,
        userId: debitCard.userId,
        dueDate: moment(),
      }),
    ]);

    await bankAccount.update({ defaultPaymentMethodId: debitCard.id });

    const data = {
      subscriptionBillingId: billing.id,
      bankAccountId: debitCard.bankAccountId,
      recurringTransactionId: paycheck.id,
    };

    const debitSpy = sandbox.stub(Tabapay, 'retrieve');

    await subscriptionCollectionPredictedPayday(data);

    sinon.assert.notCalled(debitSpy);

    const payments = await billing.getSubscriptionPayments();

    expect(payments).to.be.empty;
  });

  it('does not charge for old subscription billings', async () => {
    fakeDate(sandbox, '2019-10-15');
    const debitCard = await factory.create('payment-method');

    const yesterday = moment()
      .subtract(1, 'day')
      .format('dddd')
      .toLowerCase();

    const expectedAmount = 1;

    const [bankAccount, paycheck, billing] = await Promise.all([
      debitCard.getBankAccount(),
      factory.create('recurring-transaction', {
        bankAccountId: debitCard.bankAccountId,
        userId: debitCard.userId,
        userAmount: 1000,
        transactionDisplayName: 'My Paycheck',
        interval: 'weekly',
        params: [yesterday],
      }),
      factory.create('subscription-billing', {
        amount: expectedAmount,
        userId: debitCard.userId,
        dueDate: moment().subtract(2, 'months'),
      }),
    ]);

    await bankAccount.update({ defaultPaymentMethodId: debitCard.id });

    const data = {
      subscriptionBillingId: billing.id,
      bankAccountId: debitCard.bankAccountId,
      recurringTransactionId: paycheck.id,
    };

    const debitSpy = sandbox.stub(Tabapay, 'retrieve');

    await subscriptionCollectionPredictedPayday(data);

    sinon.assert.notCalled(debitSpy);

    const payments = await billing.getSubscriptionPayments();

    expect(payments).to.be.empty;
  });
});
