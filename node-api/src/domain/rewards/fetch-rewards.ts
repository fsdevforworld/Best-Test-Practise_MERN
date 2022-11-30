import * as _ from 'lodash';
import { RewardsLedger, SubscriptionBilling } from '../../models';
import { checkRewardBalance } from './update-rewards';
import { UserReward } from '@dave-inc/wire-typings';

export default async function fetchRewards(userId: number): Promise<UserReward> {
  const balance: number = await checkRewardBalance(userId);
  const progress: number = _.round(balance - _.floor(balance), 2);

  const membershipsEarned: SubscriptionBilling[] = await SubscriptionBilling.findAll({
    where: {
      userId,
    },
    include: [
      {
        model: RewardsLedger,
        required: true,
      },
    ],
    order: [['billingCycle', 'DESC']],
  });

  return {
    progress,
    membershipsEarned: membershipsEarned.length,
  };
}
