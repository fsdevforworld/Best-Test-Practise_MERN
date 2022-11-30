import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import {
  collectPastDueSubscriptionPayment,
  SUBSCRIPTION_COLLECTION_TRIGGER,
} from '../domain/collection';
import { dogstatsd } from '../lib/datadog-statsd';
import { streamQuery } from '../lib/sequelize-helpers';
import { Cron, DaveCron } from './cron';
import { getMinimumDueDateToCollect } from '../domain/collection';
import logger from '../lib/logger';

const MAX_HOURS_TO_CHECK_RECENT_UPDATED_ACCOUNTS = 24;
const COLLECT_SUBSCRIPTION_RECENT_ACCOUNT_UPDATE_DATADOG_METRIC_NAME =
  'collect-subscription-recent-account-update-past-due';
const CONCURRENCY_RATE = 100;

export async function run() {
  let countToCollect = 0;

  /* NOTE: We only want 1 of each user id. This reduces the result set substantially. Using this inner join technique rather than distinct moves
     the processing time from 'query time' to 'fetch time' (ex: originally 168s for query time and 1 sec for fetch)
     but now with this technique (1 sec query time, 160s for fetch)... which allows us to start streaming during fetch

     NOTE 2: Moving the 'bank_connection join' to the outer query reduces fetch time from ~160s to ~80s (50% reduction) while keeping query time at ~1 sec
  */
  const minimumDueDateToCollect = getMinimumDueDateToCollect().format('YYYY-MM-DD');

  await streamQuery<{ userId: number }>(
    `
      SELECT u.id as userId
      FROM user u
      INNER JOIN bank_connection c ON
        c.user_id = u.id AND
        c.last_pull >= DATE_SUB(NOW(), INTERVAL ${MAX_HOURS_TO_CHECK_RECENT_UPDATED_ACCOUNTS} HOUR)
      INNER JOIN subscription_billing b2 on b2.id = (
        SELECT b.id
        FROM subscription_billing b
        LEFT JOIN subscription_payment_line_item li ON
          li.subscription_billing_id = b.id
        LEFT JOIN subscription_payment p ON
          p.id = li.subscription_payment_id AND
          p.status IN ('${ExternalTransactionStatus.Completed}', '${ExternalTransactionStatus.Pending}', '${ExternalTransactionStatus.Unknown}')
        WHERE
          p.id IS NULL AND
          b.user_id = u.id AND
          b.amount > 0 AND
          due_date < CURDATE() AND
          due_date >= ?
        LIMIT 1
    )
      `,
    async (row: { userId: number }) => {
      if (!row || !row.userId) {
        dogstatsd.increment(
          `${COLLECT_SUBSCRIPTION_RECENT_ACCOUNT_UPDATE_DATADOG_METRIC_NAME}.fatal_error.no_results`,
        );
        logger.error(`Invalid result for publish subscription collection.`);
        return;
      } else {
        dogstatsd.increment(
          `${COLLECT_SUBSCRIPTION_RECENT_ACCOUNT_UPDATE_DATADOG_METRIC_NAME}.adding_job`,
        );
      }
      countToCollect++;
      await collectPastDueSubscriptionPayment({
        userId: row.userId,
        trigger: SUBSCRIPTION_COLLECTION_TRIGGER.PAST_DUE_RECENT_ACCOUNT_UPDATE_JOB,
        wasBalanceRefreshed: true,
      });
    },
    CONCURRENCY_RATE,
    [minimumDueDateToCollect],
  );

  // TODO: Update metric and tag names on second pass through collections (keep same now for consistency)
  dogstatsd.increment(
    `${COLLECT_SUBSCRIPTION_RECENT_ACCOUNT_UPDATE_DATADOG_METRIC_NAME}.count_to_collect`,
    countToCollect,
  );
}

export const CollectSubscriptionRecentAccountUpdate: Cron = {
  name: DaveCron.CollectSubscriptionRecentAccountUpdate,
  process: run,
  schedule: '31 14 * * 1-5',
};
