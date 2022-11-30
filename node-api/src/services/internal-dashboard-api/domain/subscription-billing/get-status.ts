import { moment } from '@dave-inc/time-lib';
import { flatten, orderBy } from 'lodash';
import {
  DashboardSubscriptionBillingModification,
  Reimbursement,
  SubscriptionBilling,
  SubscriptionPayment,
} from '../../../../models';
import { ActionCode } from '../action-log';

type FormattedBillingStatus =
  | 'FREE'
  | 'ISSUE'
  | 'PAID'
  | 'PAST DUE'
  | 'REFUNDED'
  | 'OPEN'
  | 'UNCOLLECTABLE'
  | 'WAIVED';

async function wasBillingWaived(subscriptionBillingId: number): Promise<boolean> {
  const waivedModifications = await DashboardSubscriptionBillingModification.scope({
    method: ['withActionCode', ActionCode.WaiveSubscription],
  }).findAll({
    where: {
      subscriptionBillingId,
    },
  });

  if (waivedModifications.length) {
    return true;
  }

  return false;
}

async function getSubscriptionBillingStatus(
  subscriptionBillingId: number,
): Promise<FormattedBillingStatus> {
  const subscriptionBilling = await SubscriptionBilling.findByPk(subscriptionBillingId, {
    include: [
      {
        model: SubscriptionPayment,
        include: [Reimbursement],
      },
    ],
  });

  const payments = subscriptionBilling.subscriptionPayments;

  const refunds = flatten(payments.map(({ reimbursements }) => reimbursements));

  if (refunds.length) {
    const [lastRefund] = orderBy(refunds, 'created', 'desc');

    if (['CANCELED', 'FAILED', 'RETURNED'].includes(lastRefund.status)) {
      return 'ISSUE';
    }

    return 'REFUNDED';
  }

  if (subscriptionBilling.amount === 0) {
    const isWaived = await wasBillingWaived(subscriptionBilling.id);

    return isWaived ? 'WAIVED' : 'FREE';
  }

  const completedPaymentsAmount = payments.reduce(
    (amount, payment) => (payment.status === 'COMPLETED' ? amount + payment.amount : amount),
    0,
  );

  const outstanding = subscriptionBilling.amount - completedPaymentsAmount;

  if (outstanding < 0) {
    return 'ISSUE';
  }

  if (outstanding === 0) {
    return 'PAID';
  }

  const dueDate = moment(subscriptionBilling.dueDate);
  const now = moment();
  const daysPastDue = now.diff(dueDate, 'days');

  if (daysPastDue > 40) {
    return 'UNCOLLECTABLE';
  }

  if (daysPastDue > 0) {
    return 'PAST DUE';
  }

  return 'OPEN';
}

export { FormattedBillingStatus };
export default getSubscriptionBillingStatus;
