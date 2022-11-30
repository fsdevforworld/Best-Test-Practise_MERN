import { Advance } from '../../models';
import BigNumber from 'bignumber.js';
import { BaseApiError } from '../../lib/error';

function calculateTipPercent(advance: Advance, newTipAmount: number): number {
  if (advance.amount === 0) {
    throw new BaseApiError('Advance amount is 0', { statusCode: 500 });
  }

  const bigNumberTipAmount = new BigNumber(newTipAmount);
  const newTipPercent = bigNumberTipAmount.dividedBy(advance.amount).times(100);

  return newTipPercent.toNumber();
}

export default calculateTipPercent;
