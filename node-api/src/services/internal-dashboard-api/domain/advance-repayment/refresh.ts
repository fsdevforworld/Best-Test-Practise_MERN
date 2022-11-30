import { moment } from '@dave-inc/time-lib';
import { getTivanClient } from '../../../../lib/tivan-client';
import { DashboardAdvanceRepayment, sequelize } from '../../../../models';
import { dogstatsd } from '../../../../lib/datadog-statsd';
import logger from '../../../../lib/logger';

import update from './update';
import updateStatus from './update-status';

const metricBase = 'refresh_dashboard_advance_repayment';

async function handleTaskNotFound(repayment: DashboardAdvanceRepayment): Promise<void> {
  logger.error(`Could not find dashboard advance repayment`, {
    dashboardAdvanceRepaymentId: repayment.id,
    tivanTaskId: repayment.tivanTaskId,
  });
  dogstatsd.increment(`${metricBase}.task_not_found`);

  const expiredThreshold = 60;
  if (repayment.created.isBefore(moment().subtract(expiredThreshold, 'minutes'))) {
    await sequelize.transaction(async transaction => {
      await updateStatus(repayment, 'FAILED', transaction);
    });
  }
}

async function getTask(repayment: DashboardAdvanceRepayment) {
  try {
    const { tivanTaskId } = repayment;

    const task = await getTivanClient().task(tivanTaskId);

    return task;
  } catch (error) {
    if (error?.status === 404) {
      await handleTaskNotFound(repayment);
      return null;
    }

    throw error;
  }
}

async function refresh(repayment: DashboardAdvanceRepayment): Promise<void> {
  try {
    dogstatsd.increment(`${metricBase}.attempt`);

    const tivanTask = await getTask(repayment);

    if (tivanTask) {
      await update(tivanTask);
    }

    dogstatsd.increment(`${metricBase}.success`);
  } catch (error) {
    dogstatsd.increment(`${metricBase}.error`);

    logger.error('Could not refresh repayment', {
      error,
      dashboardAdvanceRepaymentId: repayment.id,
    });

    throw error;
  }
}

export default refresh;
