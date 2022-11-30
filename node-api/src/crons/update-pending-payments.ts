import { Payment } from '../models';
import { createUpdatePaymentStatusTask } from '../jobs/data';
import { Op } from 'sequelize';
import { dogstatsd } from '../lib/datadog-statsd';
import { moment } from '@dave-inc/time-lib';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { Cron, DaveCron } from './cron';

export async function run() {
  const payments = await Payment.findAll({
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
            .subtract(3, 'months')
            .toISOString(),
          moment()
            .subtract(5, 'minutes')
            .toISOString(),
        ],
      },
    },
  });

  dogstatsd.increment('update_pending_payments.payments_in_limbo_before_job_ran', payments.length);

  for (const payment of payments) {
    await createUpdatePaymentStatusTask({ paymentId: payment.id });
  }
}

export const UpdatePendingPayments: Cron = {
  name: DaveCron.UpdatePendingPayments,
  process: run,
  schedule: '0 */4 * * *',
};
