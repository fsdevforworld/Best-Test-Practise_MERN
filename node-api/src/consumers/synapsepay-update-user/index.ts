import * as config from 'config';

import PubSub from '../../lib/pubsub';

import { handleMessage } from './handle-message';
import logger from '../../lib/logger';

const topic: string = config.get('pubsub.synapsepay.updateUser.topicName');
const subscription: string = config.get('pubsub.synapsepay.updateUser.subscriptionName');

PubSub.subscribe(topic, subscription, handleMessage, error =>
  logger.error(`Pubsub error ${topic}`, { error }),
);
