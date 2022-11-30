import { NotFoundError } from '../../lib/error';
import { Advance, AdvanceTip, sequelize } from '../../models';
import calculateTipPercent from './calculate-tip-percent';
import setTip from './set-tip';
import { AppsflyerProperties } from '../../typings';
import { Transaction } from 'sequelize/types';

interface ISetTipAmountOptions {
  analyticsData?: AppsflyerProperties;
  transaction?: Transaction;
}

async function setTipAmount(
  advance: Advance,
  amount: number,
  source: string,
  options?: ISetTipAmountOptions,
): Promise<{
  tipAmount: { previous: number; current: number };
  tipPercent: { previous: number; current: number };
  outstanding: { previous: number; current: number };
}> {
  return sequelize.transaction(async txn => {
    const transaction = options?.transaction || txn;

    const lockedAdvance = await Advance.findByPk(advance.id, {
      include: [AdvanceTip],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const lockedAdvanceTip = lockedAdvance.advanceTip;

    if (lockedAdvance.disbursementStatus === 'CANCELED') {
      return;
    }

    if (!lockedAdvanceTip) {
      throw new NotFoundError(`AdvanceTip with advanceId ${lockedAdvance.id} not found`);
    }

    const percent = calculateTipPercent(lockedAdvance, amount);

    return setTip(lockedAdvance, amount, percent, source, { ...options, transaction });
  });
}

export default setTipAmount;
