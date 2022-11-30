import { BigNumber } from 'bignumber.js';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../models';
import { completedOrPendingStatuses } from '../../models/payment';
import { Transactionable } from 'sequelize/types';

export default async function getPaidAmount(
  advanceId: number,
  options: Transactionable = {},
): Promise<BigNumber> {
  const { transaction } = options;
  const [{ amount }] = await sequelize.query(
    `
      SELECT IFNULL(SUM(amount), 0) as amount
      FROM payment
      WHERE
        advance_id = :advanceId AND
        status IN (:paymentStatuses)
    `,
    {
      replacements: { advanceId, paymentStatuses: completedOrPendingStatuses },
      type: QueryTypes.SELECT,
      transaction,
    },
  );

  return new BigNumber(amount);
}
