import { FindOptions } from 'sequelize';
import { Payment } from '../models';
import { createUpdatePaymentStatusTask } from '../jobs/data';
import { Op } from 'sequelize';
import { dogstatsd } from '../lib/datadog-statsd';
import { moment } from '@dave-inc/time-lib';
import { ExternalTransactionStatus, ExternalTransactionProcessor } from '@dave-inc/wire-typings';
import { Cron, DaveCron } from './cron';
import logger from '../lib/logger';
import { streamFindAll } from '../lib/sequelize-helpers';
import sendgrid from '../lib/sendgrid';

export async function run() {
  const startTime = moment()
    .subtract(6, 'days')
    .toISOString();
  const endTime = moment()
    .subtract(5, 'minutes')
    .toISOString();
  const query: FindOptions = {
    where: {
      status: {
        [Op.in]: [ExternalTransactionStatus.Completed],
      },
      externalProcessor: {
        [Op.in]: [ExternalTransactionProcessor.Synapsepay],
      },
      created: {
        [Op.between]: [startTime, endTime],
      },
    },
  };

  const paymentIDs: number[] = [];
  await streamFindAll<Payment>(Payment, query, async (payment: Payment) => {
    dogstatsd.increment('update_completed_payments.synapse_returned_payments', 1);
    logger.info('creating update payment status task', {
      paymentId: payment.id,
    });
    await createUpdatePaymentStatusTask({ paymentId: payment.id });
    paymentIDs.push(payment.id);
  });

  const subject = `Completed Synapse Payments To Be Updated from ${startTime} to ${endTime}`;
  const destinationEmail = ['returned-payment-status@dave.com'];
  const emailBody =
    '<a href="https://p.datadoghq.com/sb/abe510f47-63b847c72d2cdde660199fa0c6eda9d7">See dashboard</a><br>' +
    paymentIDs.join('<br>');
  await sendgrid.sendHtml(subject, emailBody, destinationEmail);
  dogstatsd.increment('update_completed_payments.synapse_report_emailed');
}

export const UpdateCompletedSynapsePayments: Cron = {
  name: DaveCron.UpdateCompletedSynapsePayments,
  process: run,
  schedule: '0 */4 * * *',
  envVars: {
    READ_REPLICA_HOST: 'cloudsql-proxy-replica',
    READ_REPLICA_PORT: '3306',
    DB_USE_READ_REPLICA: 'true',
  },
};
