import BigNumber from 'bignumber.js';
import { SubscriptionBilling, SubscriptionPayment } from '../../../../models';

async function canWaive(subscriptionBillingId: number) {
  const subscriptionBilling = await SubscriptionBilling.findByPk(subscriptionBillingId, {
    include: [SubscriptionPayment],
  });
  if (subscriptionBilling.amount === 0) {
    return false;
  }

  const payments = subscriptionBilling.subscriptionPayments;

  if (payments.length === 0) {
    return true;
  }

  const paidAmount = payments.reduce(
    (amount, payment) =>
      ['COMPLETED', 'PENDING'].includes(payment.status) ? amount.plus(payment.amount) : amount,
    new BigNumber(0),
  );

  const outstanding = new BigNumber(subscriptionBilling.amount).minus(paidAmount);

  if (outstanding.lte(0)) {
    return false;
  }

  return true;
}

export default canWaive;
