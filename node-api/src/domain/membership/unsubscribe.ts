import { User } from '../../models';
import { moment } from '@dave-inc/time-lib';
import { getForBillingCycle } from '../subscription-billing';
import { Transaction } from 'sequelize';

export async function unsubscribe(user: User, transaction: Transaction = null): Promise<void> {
  await Promise.all([
    user.update({ subscriptionFee: 0 }, { transaction }),
    clearSubscriptionForCurrentMonth(user, transaction),
  ]);
}

async function clearSubscriptionForCurrentMonth(
  user: User,
  transaction: Transaction,
): Promise<void> {
  const now = moment();
  const currentSubscriptionBilling = await getForBillingCycle(user.id, now);

  if (!!currentSubscriptionBilling) {
    const isAwaitingPayment = await currentSubscriptionBilling.isAwaitingPayment();
    if (isAwaitingPayment) {
      await currentSubscriptionBilling.update({ amount: 0 }, { transaction });
    }
  }
}
