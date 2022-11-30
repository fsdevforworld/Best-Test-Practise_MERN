import PubSub from '../../lib/pubsub';
import * as config from 'config';
import { processAdvanceCollectionEvent } from './process-event';
import logger from '../../lib/logger';

const MAX_MESSAGES: number = config.get('pubsub.advanceProcessorMaxMessages');

const topicName: string = config.get('pubsub.advanceCollectionTopic');
const subscriptionName: string = config.get('pubsub.advanceCollectionSubscriptionName');

PubSub.subscribe(
  topicName,
  subscriptionName,
  processAdvanceCollectionEvent,
  (error: Error) => logger.error('Error processing collect advance message', { error }),
  {
    flowControl: { maxMessages: MAX_MESSAGES },
  },
);
