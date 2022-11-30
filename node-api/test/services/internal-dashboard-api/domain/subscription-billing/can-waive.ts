import { clean } from '../../../../test-helpers';
import factory from '../../../../factories';
import { SubscriptionBilling } from '../../../../../src/models';
import { canWaiveSubscriptionBilling } from '../../../../../src/services/internal-dashboard-api/domain/subscription-billing';
import { expect } from 'chai';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
describe('canWaive', () => {
  before(() => clean());

  afterEach(() => clean());

  let subscriptionBilling: SubscriptionBilling;

  beforeEach(async () => {
    subscriptionBilling = await factory.create('subscription-billing');
  });

  it('Returns true when there are no payments for the billing', async () => {
    const canWaive = await canWaiveSubscriptionBilling(subscriptionBilling.id);

    expect(canWaive).to.be.true;
  });

  it('Returns false on a free billing when there are no payments for the billing', async () => {
    const freeSubscriptionBilling = await factory.create('subscription-billing', { amount: 0 });
    const canWaive = await canWaiveSubscriptionBilling(freeSubscriptionBilling.id);

    expect(canWaive).to.be.false;
  });

  it('Returns false when there is a completed payment equalling the cost of the billing', async () => {
    const payment = await factory.create('subscription-payment');
    await factory.create('subscription-payment-line-item', {
      subscriptionBillingId: subscriptionBilling.id,
      subscriptionPaymentId: payment.id,
    });

    const canWaive = await canWaiveSubscriptionBilling(subscriptionBilling.id);

    expect(canWaive).to.be.false;
  });

  it('Returns false when there is a pending payment equalling the cost of the billing', async () => {
    const payment = await factory.create('subscription-payment', {
      status: ExternalTransactionStatus.Pending,
    });
    await factory.create('subscription-payment-line-item', {
      subscriptionBillingId: subscriptionBilling.id,
      subscriptionPaymentId: payment.id,
    });

    const canWaive = await canWaiveSubscriptionBilling(subscriptionBilling.id);

    expect(canWaive).to.be.false;
  });

  it('Returns true when there is a completed payment less than the cost of the billing', async () => {
    const payment = await factory.create('subscription-payment', { amount: 0.5 });
    await factory.create('subscription-payment-line-item', {
      subscriptionBillingId: subscriptionBilling.id,
      subscriptionPaymentId: payment.id,
    });

    const canWaive = await canWaiveSubscriptionBilling(subscriptionBilling.id);

    expect(canWaive).to.be.true;
  });

  it('Returns true when there is a failed payment', async () => {
    const payment = await factory.create('subscription-payment', {
      status: ExternalTransactionStatus.Canceled,
    });
    await factory.create('subscription-payment-line-item', {
      subscriptionBillingId: subscriptionBilling.id,
      subscriptionPaymentId: payment.id,
    });

    const canWaive = await canWaiveSubscriptionBilling(subscriptionBilling.id);

    expect(canWaive).to.be.true;
  });
});
