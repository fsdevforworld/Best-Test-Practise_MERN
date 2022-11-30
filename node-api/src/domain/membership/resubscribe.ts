import { User } from '../../models';
import { calculateAmount } from '../../helper/subscription-billing';
import { moment } from '@dave-inc/time-lib';
import { getForBillingCycle } from '../subscription-billing';
import { Transaction } from 'sequelize';

export async function resubscribe(user: User, transaction: Transaction = null): Promise<void> {
  await Promise.all([
    user.update({ subscriptionFee: 1 }, { transaction }),
    chargeSubscriptionForCurrentMonth(user, transaction),
  ]);
}

async function chargeSubscriptionForCurrentMonth(
  user: User,
  transaction: Transaction,
): Promise<void> {
  const now = moment();
  const subscriptionAmountForCurrentMonth = calculateAmount(now);

  if (subscriptionAmountForCurrentMonth > 0) {
    const currentSubscriptionBilling = await getForBillingCycle(user.id, now, transaction);

    if (!!currentSubscriptionBilling) {
      await currentSubscriptionBilling.update(
        { amount: subscriptionAmountForCurrentMonth },
        { transaction },
      );
    }
  }
}
