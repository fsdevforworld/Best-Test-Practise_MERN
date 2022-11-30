import { Transaction } from 'sequelize';
import { DashboardAdvanceRepayment } from '../../../../models';
import { isTerminalStatus } from '../../../../models/dashboard-advance-repayment';
import { dogstatsd } from '../../../../lib/datadog-statsd';
import logger from '../../../../lib/logger';

async function updateStatus(
  advanceRepayment: DashboardAdvanceRepayment,
  status: DashboardAdvanceRepayment['status'],
  transaction: Transaction,
): Promise<void> {
  await advanceRepayment.reload({ transaction, lock: Transaction.LOCK.UPDATE });

  if (isTerminalStatus(advanceRepayment.status) && status !== advanceRepayment.status) {
    const message = 'Invalid status change requested for dashboard advance repayment';

    dogstatsd.event(message, advanceRepayment.id, { alert_type: 'warning' });

    logger.info(message, {
      dashboardAdvanceRepaymentId: advanceRepayment.id,
      currentStatus: advanceRepayment.status,
      requestedStatus: status,
    });

    return;
  }

  await advanceRepayment.update({ status }, { transaction });
}

export default updateStatus;
