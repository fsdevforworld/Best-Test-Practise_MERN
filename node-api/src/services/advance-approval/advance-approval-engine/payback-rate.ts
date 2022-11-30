import { mean } from 'lodash';
import { Op } from 'sequelize';
import { Advance, Payment } from '../../../models';
import { DEFAULT_TIMEZONE, moment } from '@dave-inc/time-lib';

/**
 * Determines payback rate for the provided list of advances
 * Payback rate is the ratio of advances fully paid on-time to the total number of advances
 *
 * @param {Advance[]} advances
 * @returns {Promise<number>}
 */
export async function calculateForAdvances(advances: Advance[]): Promise<number> {
  const payments = await Payment.findAll({
    where: { advanceId: { [Op.in]: advances.map(({ id }) => id) } },
  });

  const paybackRates = advances.map(advance => {
    // Ensure advance is paid off
    if (advance.outstanding !== 0) {
      return 0;
    }

    const expectedPaybackDate = moment.tz(
      advance.paybackDate.format('YYYY-MM-DD'),
      'YYYY-MM-DD',
      DEFAULT_TIMEZONE,
    );

    const paidOnTime = payments
      .filter(({ advanceId }) => advanceId === advance.id)
      .every(({ created }) =>
        created
          .tz(DEFAULT_TIMEZONE)
          .startOf('day')
          .isSameOrBefore(expectedPaybackDate),
      );

    return paidOnTime ? 1 : 0;
  });

  return mean(paybackRates) || 0;
}
