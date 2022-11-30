import { dogstatsd } from '../../lib/datadog-statsd';
import * as moment from 'moment';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { streamQuery } from '../../lib/sequelize-helpers';
import { collectSubscriptionPayment } from '../../domain/event';
import logger from '../../lib/logger';

const PUBLISH_COLLECT_SUBSCRIPTION_METRIC_LABEL = 'publish_collect_subscription';
const CONCURRENCY_LEVEL = 250;

export default class PublishCollectSubscriptionTask {
  public dueDate: string;

  constructor(dueDate: string) {
    this.dueDate = dueDate;
  }

  public async run() {
    const start = moment();
    dogstatsd.increment(`${PUBLISH_COLLECT_SUBSCRIPTION_METRIC_LABEL}.task_started`);

    let numberUnpaid = 0;
    let numberPublished = 0;

    const publishBilling = async (row: { subscriptionBillingId: number }) => {
      if (!row || !row.subscriptionBillingId) {
        dogstatsd.increment(`${PUBLISH_COLLECT_SUBSCRIPTION_METRIC_LABEL}.fatal_error.no_results`);
        logger.error(`Invalid results for publish subscription collection.`);
        return;
      }

      const { subscriptionBillingId } = row;
      numberUnpaid += 1;

      let publishStatus: string;
      try {
        await collectSubscriptionPayment.publish({ subscriptionBillingId, forceDebitOnly: false });
        publishStatus = 'success';
        numberPublished += 1;
      } catch (ex) {
        logger.error('Error publishing subscription task', { ex });
        publishStatus = 'error_encountered';
      } finally {
        const tags = { publish_status: publishStatus };
        dogstatsd.increment(
          `${PUBLISH_COLLECT_SUBSCRIPTION_METRIC_LABEL}.attempt_to_publish`,
          tags,
        );
      }
    };

    await streamQuery<{ subscriptionBillingId: number }>(
      `
        SELECT b.id AS subscriptionBillingId
          FROM subscription_billing b
          LEFT OUTER JOIN (
            SELECT li.subscription_billing_id
            FROM subscription_payment p
            INNER JOIN subscription_payment_line_item li ON li.subscription_payment_id = p.id
            WHERE p.status IN ('${ExternalTransactionStatus.Completed}', '${ExternalTransactionStatus.Pending}', '${ExternalTransactionStatus.Unknown}', '${ExternalTransactionStatus.Chargeback}')
          ) AS complete ON complete.subscription_billing_id = b.id
          WHERE complete.subscription_billing_id IS NULL
            AND due_date = ?
            AND b.amount > 0
      `,
      publishBilling,
      CONCURRENCY_LEVEL,
      [this.dueDate],
    );

    dogstatsd.increment(
      `${PUBLISH_COLLECT_SUBSCRIPTION_METRIC_LABEL}.count_of_unpaid`,
      numberUnpaid,
    );
    dogstatsd.increment(`${PUBLISH_COLLECT_SUBSCRIPTION_METRIC_LABEL}.published`, numberPublished);

    const durationSeconds = moment().diff(start, 'seconds');

    logger.info('Finished publishing unpaid subscriptions', {
      numberUnpaid,
      numberPublished,
      durationSeconds,
      concurrencyLevel: CONCURRENCY_LEVEL,
    });

    dogstatsd.increment(`${PUBLISH_COLLECT_SUBSCRIPTION_METRIC_LABEL}.task_completed`);
  }
}
