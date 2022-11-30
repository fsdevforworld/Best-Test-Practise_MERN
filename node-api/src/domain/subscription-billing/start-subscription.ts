import { SubscriptionBilling, User } from '../../models';
import { Moment } from 'moment';
import { moment } from '@dave-inc/time-lib';
import { calculateAmount } from '../../helper/subscription-billing';

/**
 * This function can be called multiple times at the beginning of a user's life cycle
 * Make sure that anything done inside its body can be done multiple times non-destructively
 * @param user
 * @param subscriptionStartDate
 * @param promotionCode
 */
export async function startSubscription(
  user: User,
  subscriptionStartDate: Moment = moment(),
  promotionCode: string = '',
): Promise<boolean> {
  if (user.subscriptionStart !== null) {
    return false;
  }

  const end = moment(subscriptionStartDate).endOf('month');
  const amount = calculateAmount(subscriptionStartDate, promotionCode);

  await user.sequelize.transaction(async t => {
    await user.update(
      {
        subscriptionStart: subscriptionStartDate.format('YYYY-MM-DD'),
      },
      { transaction: t },
    );
    await SubscriptionBilling.upsert(
      {
        userId: user.id,
        start: subscriptionStartDate,
        end,
        amount,
        billingCycle: subscriptionStartDate.format('YYYY-MM'),
      },
      { transaction: t },
    );
  });

  return true;
}
