import { Advance } from '../models';
import { createUpdateDisbursementStatusTask } from '../jobs/data';
import { Op } from 'sequelize';
import { dogstatsd } from '../lib/datadog-statsd';
import { moment } from '@dave-inc/time-lib';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { Cron, DaveCron } from './cron';

export async function run() {
  const pendingAdvances = await Advance.findAll({
    where: {
      disbursementStatus: [ExternalTransactionStatus.Unknown, ExternalTransactionStatus.Pending],
      created: {
        [Op.gte]: moment().subtract(3, 'months'),
      },
    },
    attributes: ['id'],
  });

  dogstatsd.increment(
    'update-pending-advances.advances_in_limbo_before_job_ran',
    pendingAdvances.length,
  );

  for (const advance of pendingAdvances) {
    await createUpdateDisbursementStatusTask({ advanceId: advance.id });
  }
}

export const UpdatePendingAdvances: Cron = {
  name: DaveCron.UpdatePendingAdvances,
  process: run,
  schedule: '0 */2 * * *',
};
