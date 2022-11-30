import * as config from 'config';

export default {
  redis: {
    host: config.get<string>('redis.jobProcessor.host'),
    port: parseInt(config.get('redis.jobProcessor.port'), 10),
    db: parseInt(config.get('redis.jobProcessor.db'), 10),
  },
  prefix: 'bullQueue',
};
