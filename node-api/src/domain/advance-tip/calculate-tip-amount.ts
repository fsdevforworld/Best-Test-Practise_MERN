import { Advance } from '../../models';
import BigNumber from 'bignumber.js';

function calculateTipAmount(advance: Advance, tipPercent: number): number {
  const bigNumberTipPercent = new BigNumber(tipPercent).dividedBy(100);
  const newTipAmount = new BigNumber(advance.amount).times(bigNumberTipPercent);

  return newTipAmount.toNumber();
}

export default calculateTipAmount;
