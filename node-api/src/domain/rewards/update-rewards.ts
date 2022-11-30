import * as _ from 'lodash';
import { Transaction } from 'sequelize';
import { EmpyrEvent, RewardsLedger } from '../../models';
import { addAttributedFreeMonths } from '../../helper/subscription-billing';
import { FreeMonthSourceField, FreeMonthSourceName } from '../../typings/enums';

export async function checkRewardBalance(
  userId: number,
  transaction: Transaction = null,
): Promise<number> {
  const rewards = await RewardsLedger.sum('amount', {
    where: {
      userId,
    },
    transaction,
  });

  const rewardsAmount = _.isNaN(rewards) ? 0 : rewards;

  return rewardsAmount;
}

export default async function updateRewards(empyrEvent: EmpyrEvent) {
  const { userId } = empyrEvent;

  // Start a transaction
  await RewardsLedger.sequelize.transaction(async transaction => {
    await RewardsLedger.create(
      {
        userId,
        amount: empyrEvent.rewardAmount,
        empyrEventId: empyrEvent.id,
      },
      {
        transaction,
      },
    );

    const rewardBalance = await checkRewardBalance(userId, transaction);

    if (rewardBalance >= 1) {
      const numberOfFreeMonths = _.floor(rewardBalance);

      // Debit the rewards ledger so we can easily tell what the users balance is
      const rewardDebit = await RewardsLedger.create(
        {
          userId,
          amount: -numberOfFreeMonths,
          empyrEventId: empyrEvent.id,
        },
        {
          transaction,
        },
      );

      await addAttributedFreeMonths(
        userId,
        numberOfFreeMonths,
        transaction,
        FreeMonthSourceName.Rewards,
        FreeMonthSourceField.RewardsLedgerId,
        rewardDebit.id,
      );
    }
  });
}
