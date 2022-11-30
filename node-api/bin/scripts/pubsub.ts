import PubSub from '../../src/lib/pubsub';
import { isDevEnv } from '../../src/lib/utils';
import logger from '../../src/lib/logger';

if (!isDevEnv()) {
  logger.info('Run this script in development only');
  process.exit(1);
}

const args = process.argv;
if (args.length < 4) {
  logger.info('Must include topic and data (JSON)');
  process.exit(1);
}

const [, , topic, data] = args;
PubSub.publish(topic, JSON.parse(data))
  .catch((ex: Error) => {
    logger.error('Error publishing', { ex });
    process.exit(1);
  })
  .then(() => process.exit());
