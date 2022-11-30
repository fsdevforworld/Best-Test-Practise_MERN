import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import * as config from 'config';
import { Op } from 'sequelize';
import { moment } from '@dave-inc/time-lib';
import { dogstatsd } from '../lib/datadog-statsd';
import { SubscriptionPayment } from '../models';
import { createUpdatePendingSubscriptionPaymentTask } from '../jobs/data';
import * as Bluebird from 'bluebird';
import { Cron, DaveCron } from './cron';

const pendingPaymentWindowStr: string = config.get('subscriptions.retreivePendingPaymentWindow');
const pendingPaymentWindow = parseInt(pendingPaymentWindowStr || '1', 10);

export async function run(): Promise<void> {
  const pendingPayments = await SubscriptionPayment.findAll({
    attributes: ['id'],
    where: {
      status: ExternalTransactionStatus.Pending,
      created: {
        [Op.gte]: moment().subtract(pendingPaymentWindow, 'day'),
      },
    },
  });

  dogstatsd.increment(
    'retreive-pending-subscription-payments.current-pending-payments',
    pendingPayments.length,
  );

  await Bluebird.each(pendingPayments, async pendingPayment => {
    await createUpdatePendingSubscriptionPaymentTask({ subscriptionPaymentId: pendingPayment.id });
  });
}

export const UpdatePendingSubscriptionPayments: Cron = {
  name: DaveCron.UpdatePendingSubscriptionPayments,
  process: run,
  schedule: '0 0 * * *',
};
