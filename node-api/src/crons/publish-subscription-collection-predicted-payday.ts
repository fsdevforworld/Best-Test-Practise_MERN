import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import {
  SubscriptionCollectionPredictedPaydayQueueData,
  createSubscriptionCollectionPredictedPaydayTask,
} from '../jobs/data';
import { dogstatsd } from '../lib/datadog-statsd';
import { streamQuery } from '../lib/sequelize-helpers';
import { Cron, DaveCron } from './cron';
import { getMinimumDueDateToCollect } from '../domain/collection';

const DATADOG_METRIC_LABEL = 'subscription-collection-predicted-payday';

const CONCURRENCY = 100;

export function run(): Promise<void> {
  /*
   NOTE: this query selects one [past due subscription bill] per [user] who meets the following criteria:
    - has a [recurring income] that hasn't been missed
        OR has a [recurring income] that was missed after our last attempt to pull (thus we don't know if they actually missed it)
    - has a disconnected [bank connection]
    - has a valid [payment method] (debit)
*/
  const minimumDueDateToCollect = getMinimumDueDateToCollect().format('YYYY-MM-DD');

  return streamQuery<SubscriptionCollectionPredictedPaydayQueueData>(
    `
    SELECT b.id                                           as subscriptionBillingId,
           bank_account.id                                as bankAccountId,
           recurring_transaction.id                       as recurringTransactionId
        FROM user
		    INNER JOIN subscription_billing b ON b.id = (
          SELECT b2.id
          FROM subscription_billing b2
          LEFT OUTER JOIN subscription_payment_line_item li ON li.subscription_billing_id = b2.id
          LEFT OUTER JOIN subscription_payment p ON p.id = li.subscription_payment_id
            AND p.status IN ('${ExternalTransactionStatus.Completed}', '${ExternalTransactionStatus.Pending}', '${ExternalTransactionStatus.Unknown}', '${ExternalTransactionStatus.Chargeback}')
          WHERE p.id IS NULL
            AND b2.amount > 0
            AND b2.due_date < CURDATE()
            AND b2.due_date >= ?
            AND b2.user_id = user.id
          ORDER BY b2.id
          LIMIT 1
			  )
       INNER JOIN bank_account ON user.default_bank_account_id = bank_account.id
		   INNER JOIN recurring_transaction ON recurring_transaction.id = bank_account.main_paycheck_recurring_transaction_id
       INNER JOIN bank_connection ON bank_connection.id = bank_account.bank_connection_id AND
										 bank_connection.has_valid_credentials = false
       INNER JOIN payment_method ON payment_method.id = bank_account.default_payment_method_id AND
										payment_method.invalid IS NULL
        WHERE
          (recurring_transaction.missed IS NULL OR recurring_transaction.missed > bank_connection.last_pull)
          AND recurring_transaction.transaction_display_name != ''
    `,
    (data: SubscriptionCollectionPredictedPaydayQueueData) => {
      dogstatsd.increment(`${DATADOG_METRIC_LABEL}.adding_job`);
      return createSubscriptionCollectionPredictedPaydayTask(data);
    },
    CONCURRENCY,
    [minimumDueDateToCollect],
  );
}

export const PublishSubscriptionCollectionPredictedPayday: Cron = {
  name: DaveCron.PublishSubscriptionCollectionPredictedPayday,
  process: run,
  schedule: '30 14 * * *',
};
