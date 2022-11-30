import * as config from 'config';
import { PubSubClient } from '@dave-inc/pubsub';

const projectId = config.get<string>('googleCloud.projectId');
const topicPrefix = config.get<string>('pubsub.topicPrefix');
const subscriptionPrefix = config.get<string>('pubsub.subscriptionPrefix');

export default new PubSubClient(projectId, { topicPrefix, subscriptionPrefix });
