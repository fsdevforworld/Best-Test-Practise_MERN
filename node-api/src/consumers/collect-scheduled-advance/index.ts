import pubsub from '../../lib/pubsub';
import * as config from 'config';
import { processScheduledAdvanceCollectionEvent } from './process-event';
import logger from '../../lib/logger';

const MAX_MESSAGES: number = config.get('pubsub.scheduledAdvanceProcessorMaxMessages');

const topicName: string = config.get('pubsub.scheduledAdvanceCollectionTopic');
const subscriptionName: string = config.get('pubsub.scheduledAdvanceCollectionSubscriptionName');

pubsub.subscribe(
  topicName,
  subscriptionName,
  processScheduledAdvanceCollectionEvent,
  (err: Error) => logger.error('Error in collect scheduled advance subscriber', { err }),
  {
    flowControl: { maxMessages: MAX_MESSAGES },
  },
);
