import { TaskInterleaved } from '../../../../lib/tivan-client';
import { DashboardAdvanceRepayment, DashboardPayment, sequelize } from '../../../../models';

import extractStatusFromTask from './extract-status-from-task';
import extractPaymentsFromTask from './extract-payments-from-task';
import updateStatus from './update-status';

async function update(task: TaskInterleaved): Promise<void> {
  const { taskId } = task;
  const status = extractStatusFromTask(task);
  const dashboardPaymentsData = extractPaymentsFromTask(task).map(paymentResult => ({
    tivanReferenceId: paymentResult.referenceId,
    tivanTaskId: taskId,
  }));

  const advanceRepayment = await DashboardAdvanceRepayment.findByPk(taskId, {
    rejectOnEmpty: true,
  });

  await sequelize.transaction(async transaction => {
    await updateStatus(advanceRepayment, status, transaction);

    await DashboardPayment.bulkCreate(dashboardPaymentsData, {
      transaction,
      ignoreDuplicates: true,
    });
  });
}

export default update;
