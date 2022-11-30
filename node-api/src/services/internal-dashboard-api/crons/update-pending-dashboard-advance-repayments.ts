import { DashboardAdvanceRepayment } from '../../../models';
import { Cron, DaveCron } from '../../../crons/cron';
import logger from '../../../lib/logger';

import { refresh } from '../domain/advance-repayment';

async function run() {
  const repaymentAttempts = await DashboardAdvanceRepayment.findAll({
    where: { status: 'PENDING' },
  });

  const count = repaymentAttempts.length;

  logger.info(`Attempting refresh on pending dashboard advance repayments`, {
    count,
  });

  const results = repaymentAttempts.map(repaymentAttempt => {
    return refresh(repaymentAttempt).catch(() => {});
  });

  await Promise.all(results);

  logger.info(`Finished updating pending dashboard advance repayments`, {
    count,
  });
}

const UpdatePendingDashboardAdvanceRepayment: Cron = {
  name: DaveCron.UpdatePendingDashboardAdvanceRepayments,
  process: run,
  schedule: '*/15 * * * *',
};

export default UpdatePendingDashboardAdvanceRepayment;
