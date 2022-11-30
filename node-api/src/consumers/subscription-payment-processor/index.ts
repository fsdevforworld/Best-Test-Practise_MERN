import { Message } from '@google-cloud/pubsub';
import { dogstatsd } from '../../lib/datadog-statsd';
import Task from './task';
import { SUBSCRIPTION_COLLECTION_TRIGGER } from '../../domain/collection';
import { ExecutionStatus } from '../../typings';
import * as _ from 'lodash';
import { moment } from '@dave-inc/time-lib';
import { collectSubscriptionPayment } from '../../domain/event';
import logger from '../../lib/logger';

const DEFAULT_MAX_MESSAGES = 30;
const DATADOG_METRIC_LABEL = 'subscription_payment_processor';
const SUBSCRIPTION_NAME = 'collect-subscription';

const MAX_MESSAGES =
  parseInt(process.env.SUBSCRIPTION_PROCESSOR_MAX_MESSAGES, 10) || DEFAULT_MAX_MESSAGES;

collectSubscriptionPayment.subscribe({
  subscriptionName: SUBSCRIPTION_NAME,
  onMessage: processEvent,
  onError: (error: Error) => logger.error('Collect subscription error', { error }),
  options: {
    flowControl: { maxMessages: MAX_MESSAGES },
  },
});

async function processEvent(event: Message, data: any) {
  const { subscriptionBillingId, forceDebitOnly = false } = data;

  try {
    // Investigation into pubsub issue
    const type = 'Subscription Collection Daily Job Investigation';
    const sessionId = Math.round(Math.random() * 1000000);
    const sessionStartTime = moment();

    const task = new Task(
      subscriptionBillingId,
      SUBSCRIPTION_COLLECTION_TRIGGER.DAILY_JOB,
      undefined,
      forceDebitOnly,
    );
    const result = await task.run();

    logger.info('Start processing subscription payment', {
      type,
      subscriptionBillingId,
      sessionId,
      sessionStartTime,
    });

    // TODO: Rewrite collections
    if (result && result.status === ExecutionStatus.FailureDoNotRetry && result.failures) {
      if (_.some(result.failures, failure => (failure.message = 'plaid_rate_limit_retry'))) {
        event.nack();
        logger.info('Finished with NACK', {
          type,
          subscriptionBillingId,
          sessionId,
          sessionStartTime,
          sessionDurationMs: moment().diff(sessionStartTime, 'milliseconds'),
        });
        return;
      }
    }
    event.ack();
    dogstatsd.increment(`${DATADOG_METRIC_LABEL}.process_event_success`);
    logger.info('Finished with ACK', {
      type,
      subscriptionBillingId,
      sessionId,
      sessionStartTime,
      sessionDurationMs: moment().diff(sessionStartTime, 'milliseconds'),
    });
  } catch (ex) {
    logger.error('Error processing subscription', { ex });
    dogstatsd.increment(`${DATADOG_METRIC_LABEL}.process_event_error`);
  }
}
