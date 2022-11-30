import { BigNumber } from 'bignumber.js';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../models';
import { completedOrPendingStatuses as paymentCompletedOrPendingStatuses } from '../../models/payment';
import { completedOrPendingStatuses as reversalCompletedOrPendingStatuses } from '../../models/payment-reversal';
import { completedOrPendingStatuses as reimbursementCompletedOrPendingStatuses } from '../../models/reimbursement';
import { Transactionable } from 'sequelize/types';

async function getRefundTotal(
  advanceId: number,
  options: Transactionable = {},
): Promise<BigNumber> {
  const { transaction } = options;
  const [{ amount }] = await sequelize.query(
    `
      SELECT IFNULL(SUM(li.amount), 0) as amount
      FROM advance_refund_line_item li
      INNER JOIN advance_refund ar ON ar.id = li.advance_refund_id
      INNER JOIN reimbursement r ON ar.reimbursement_id = r.id
      WHERE
        li.adjust_outstanding = true AND
        ar.advance_id = :advanceId AND
        r.status IN (:reimbursementStatuses)
    `,
    {
      replacements: { advanceId, reimbursementStatuses: reimbursementCompletedOrPendingStatuses },
      type: QueryTypes.SELECT,
      transaction,
    },
  );

  return new BigNumber(amount);
}

async function getReversalTotal(
  advanceId: number,
  options: Transactionable = {},
): Promise<BigNumber> {
  const { transaction } = options;
  const [{ amount }] = await sequelize.query(
    `
      SELECT IFNULL(SUM(pr.amount), 0) as amount
      FROM payment_reversal pr
      INNER JOIN payment p ON p.id = pr.payment_id
      WHERE
        p.advance_id = :advanceId AND
        p.status IN (:paymentStatuses) AND
        pr.status IN (:reversalStatuses)
    `,
    {
      replacements: {
        advanceId,
        paymentStatuses: paymentCompletedOrPendingStatuses,
        reversalStatuses: reversalCompletedOrPendingStatuses,
      },
      type: QueryTypes.SELECT,
      transaction,
    },
  );

  return new BigNumber(amount);
}

export default async function getRefundAmount(
  advanceId: number,
  options: Transactionable = {},
): Promise<BigNumber> {
  const { transaction } = options;
  const [refunds, reversals] = await Promise.all([
    getRefundTotal(advanceId, { transaction }),
    getReversalTotal(advanceId, { transaction }),
  ]);

  return new BigNumber(0).plus(refunds).plus(reversals);
}
