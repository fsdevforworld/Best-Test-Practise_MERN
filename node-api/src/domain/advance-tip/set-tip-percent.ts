import { NotFoundError } from '../../lib/error';
import { Advance, AdvanceTip, sequelize } from '../../models';
import calculateTipAmount from './calculate-tip-amount';
import setTip from './set-tip';
import { AppsflyerProperties } from '../../typings';
import { Transaction } from 'sequelize/types';

interface ISetTipPercentOptions {
  analyticsData?: AppsflyerProperties;
  transaction?: Transaction;
}

async function setTipPercent(
  advance: Advance,
  percent: number,
  source: string,
  options?: ISetTipPercentOptions,
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

    const amount = calculateTipAmount(lockedAdvance, percent);

    return setTip(lockedAdvance, amount, percent, source, { ...options, transaction });
  });
}

export default setTipPercent;
