import { Transaction } from 'sequelize/types';
import * as Jobs from '../../jobs/data';
import { Advance } from '../../models';
import { InvalidParametersError } from '../../lib/error';
import { InstanceUpdateOptionsWithMetadata } from '../../typings/sequelize';
import BigNumber from 'bignumber.js';
import { AppsflyerProperties } from '../../typings';

interface ISetTipOptions {
  analyticsData?: AppsflyerProperties;
  transaction: Transaction;
}

async function setTip(
  advance: Advance,
  tipAmount: number,
  tipPercent: number,
  source: string,
  options: ISetTipOptions,
): Promise<{
  tipAmount: { previous: number; current: number };
  tipPercent: { previous: number; current: number };
  outstanding: { previous: number; current: number };
}> {
  const advanceTip = advance.advanceTip;

  const previousTipAmount = advanceTip.amount;
  const previousTipPercent = advanceTip.percent;
  const previousOutstanding = advance.outstanding;

  const difference = new BigNumber(tipAmount).minus(previousTipAmount || 0);
  const outstanding = new BigNumber(advance.outstanding).plus(difference);

  if (outstanding.lt(0)) {
    throw new InvalidParametersError('New tip amount leads to a negative amount owed.');
  }

  await advance.update(
    {
      outstanding: outstanding.toFixed(2),
    },
    {
      metadata: { source },
      transaction: options.transaction,
    } as InstanceUpdateOptionsWithMetadata,
  );
  await advanceTip.update(
    {
      percent: tipPercent,
      amount: tipAmount.toFixed(2),
    },
    {
      metadata: { source },
      transaction: options.transaction,
    } as InstanceUpdateOptionsWithMetadata,
  );

  await Jobs.broadcastAdvanceTipChangedTask({
    advanceId: advance.id,
    amount: difference.toNumber(),
    ...options?.analyticsData,
  });

  return {
    tipAmount: {
      previous: previousTipAmount,
      current: tipAmount,
    },
    tipPercent: {
      previous: previousTipPercent,
      current: tipPercent,
    },
    outstanding: {
      previous: previousOutstanding,
      current: outstanding.toNumber(),
    },
  };
}

export default setTip;
