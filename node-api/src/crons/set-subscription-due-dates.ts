import { SubscriptionBilling } from '../models';
import { moment } from '@dave-inc/time-lib';
import { dogstatsd } from '../lib/datadog-statsd';
import { Op } from 'sequelize';
import { Cron, CronConcurrencyPolicy, DaveCron } from './cron';
import { Moment } from 'moment';
import * as Jobs from '../jobs/data';
import { processInBatches } from '../lib/utils';
import logger from '../lib/logger';

const SET_SUBSCRIPTION_DUE_DATE = 'set_subscription_due_dates_task';

export async function run({
  billingCycle = moment().format('YYYY-MM'),
  cutoffTime = moment().subtract(20, 'minutes'),
  batchSize = 10000,
}: { billingCycle?: string; cutoffTime?: Moment; batchSize?: number } = {}) {
  // Give users time to select their paycheck after connecting bank account
  dogstatsd.increment(`${SET_SUBSCRIPTION_DUE_DATE}.task_started`);

  const getBatch = (
    limit: number,
    offset: number,
    previous?: SubscriptionBilling[],
  ): Promise<SubscriptionBilling[]> => {
    const lastId = previous?.[previous.length - 1].id || 0;

    return SubscriptionBilling.findAll({
      attributes: ['id'],
      where: {
        id: { [Op.gt]: lastId },
        billingCycle,
        amount: { [Op.gt]: 0 },
        dueDate: null,
        created: { [Op.lte]: cutoffTime },
      },
      limit,
      order: [['id', 'ASC']],
    });
  };

  await processInBatches(
    getBatch,
    async (billings: SubscriptionBilling[]) => {
      dogstatsd.increment(
        `${SET_SUBSCRIPTION_DUE_DATE}.count_of_billings_created`,
        billings.length,
      );

      for (const billing of billings) {
        try {
          await Jobs.createSetSubscriptionDueDateTask({ subscriptionBillingId: billing.id });
        } catch (ex) {
          logger.error('Error creating set subscription due date task', { ex });
          dogstatsd.increment(`${SET_SUBSCRIPTION_DUE_DATE}.error_encountered_while_publishing`);
        }
      }
    },
    batchSize,
  );

  dogstatsd.increment(`${SET_SUBSCRIPTION_DUE_DATE}.task_completed`);
}

export const SetSubscriptionDueDates: Cron = {
  name: DaveCron.SetSubscriptionDueDates,
  process: run,
  concurrencyPolicy: CronConcurrencyPolicy.Forbid,
  schedule: '0,30 * * * *',
};
