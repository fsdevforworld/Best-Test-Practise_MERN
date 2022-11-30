import ErrorHelper from '@dave-inc/error-helper';
import { Moment } from 'moment';
import { QueryTypes } from 'sequelize';

import { dogstatsd } from '../lib/datadog-statsd';
import logger from '../lib/logger';
import { moment } from '@dave-inc/time-lib';
import { sequelize } from '../models';
import { processInBatches } from '../lib/utils';

import { Cron, DaveCron } from './cron';

type BillableUser = {
  id: number;
  subscriptionFee: number;
};

// userId, start, end, subscriptionFee, billingCycle
type BillingInsertValues = [number, string, string, number, string];

enum Metric {
  BillingCreated = 'crons.create_subscription_billing.billing_created',
  BatchInsertFailed = 'crons.create_subscription_billing.batch_insert_failed',
}

const DEFAULT_BATCH_SIZE = 10000;

export async function run({
  start = moment().startOf('month'),
  end = moment().endOf('month'),
  batchSize = DEFAULT_BATCH_SIZE,
}: { start?: Moment; end?: Moment; batchSize?: number } = {}) {
  logger.info('Starting create-subscription-billings task', {
    start,
    end,
    batchSize,
  });

  await processInBatches<BillableUser>(
    (limit, offset, previous) =>
      getUsersBatch({
        startDate: start,
        limit,
        startAfterId: previous?.[previous.length - 1].id || 0,
      }),
    async (batch: BillableUser[]) => processBatch(batch, { start, end }),
    batchSize,
  );

  logger.info('Done creating subscription billings');
}

function insert(insertValues: BillingInsertValues[]) {
  return sequelize.query(
    `
              INSERT INTO subscription_billing (user_id, start, end, amount, billing_cycle)
              VALUES ?
    `,
    { replacements: [insertValues] },
  );
}

function buildInsert(
  user: BillableUser,
  start: string,
  end: string,
  billingCycle: string,
): BillingInsertValues {
  return [user.id, start, end, user.subscriptionFee, billingCycle];
}

export async function getUsersBatch({
  startDate,
  limit = DEFAULT_BATCH_SIZE,
  startAfterId = 0,
}: {
  startDate: Moment;
  limit?: number;
  startAfterId?: number;
}): Promise<BillableUser[]> {
  return sequelize.query(
    `
              SELECT user.id,
                     user.subscription_fee as subscriptionFee
              FROM user
                       LEFT JOIN subscription_billing ON
                      subscription_billing.user_id = user.id AND
                      subscription_billing.deleted IS NULL AND
                      subscription_billing.billing_cycle = ?
              WHERE user.deleted > ?
                AND user.id > ?
                AND is_subscribed = true
                AND subscription_start <= ?
                AND subscription_billing.id IS NULL
            ORDER BY user.id ASC
            LIMIT ?
    `,
    {
      replacements: [
        startDate.format('YYYY-MM'),
        _serializeMoment(startDate),
        startAfterId,
        _serializeMoment(startDate),
        limit,
      ],
      type: QueryTypes.SELECT,
    },
  );
}

async function processBatch(
  batch: BillableUser[],
  { start, end }: { start: Moment; end: Moment },
): Promise<void> {
  const billingCycle = start.format('YYYY-MM');

  logger.info(`Creating batch of ${batch.length} subscription billings for ${billingCycle}`);

  const batchInsertValues = batch.map(user =>
    buildInsert(user, _serializeMoment(start), _serializeMoment(end), billingCycle),
  );

  try {
    await insert(batchInsertValues);

    dogstatsd.increment(Metric.BillingCreated, batchInsertValues.length);
  } catch (err) {
    dogstatsd.increment(Metric.BatchInsertFailed);
    logger.error('Failed to bulk insert subscription_billing records', {
      error: ErrorHelper.logFormat(err),
    });
  }
}

function _serializeMoment(date: Moment) {
  return date.format('YYYY-MM-DD HH:mm:ss');
}

export const CreateSubscriptionBillings: Cron = {
  name: DaveCron.CreateSubscriptionBillings,
  process: run,
  schedule: '1 0 1 * *',
};
