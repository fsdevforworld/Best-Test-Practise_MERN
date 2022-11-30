import { SubscriptionBilling } from '../../models';
import { Moment } from 'moment';
import { Transaction } from 'sequelize';

export async function getForBillingCycle(
  userId: number,
  date: Moment,
  transaction: Transaction = null,
): Promise<SubscriptionBilling> {
  return SubscriptionBilling.findOne({
    where: {
      userId,
      billingCycle: date.format('YYYY-MM'),
    },
    transaction,
  });
}
