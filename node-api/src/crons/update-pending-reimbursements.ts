import * as config from 'config';
import { Reimbursement } from '../models';
import { createUpdateReimbursementStatusTask } from '../jobs/data';
import { Op } from 'sequelize';
import { dogstatsd } from '../lib/datadog-statsd';
import { moment } from '@dave-inc/time-lib';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { Cron, DaveCron } from './cron';

const START_MONTHS_AGO = config.get<number>('crons.reimbursementStart');

export async function run() {
  const reimbursements = await Reimbursement.findAll({
    where: {
      status: {
        [Op.in]: [ExternalTransactionStatus.Pending, ExternalTransactionStatus.Unknown],
      },
      referenceId: {
        [Op.ne]: null,
      },
      created: {
        [Op.between]: [
          moment()
            .subtract(START_MONTHS_AGO, 'months')
            .toISOString(),
          moment()
            .subtract(5, 'minutes')
            .toISOString(),
        ],
      },
    },
  });

  dogstatsd.increment(
    'update_pending_reimbursements.reimbursements_in_limbo_before_job_ran',
    reimbursements.length,
  );

  for (const reimbursement of reimbursements) {
    await createUpdateReimbursementStatusTask({ reimbursementId: reimbursement.id });
  }
}

export const UpdatePendingReimbursements: Cron = {
  name: DaveCron.UpdatePendingReimbursements,
  process: run,
  schedule: '0 0 * * *',
};
