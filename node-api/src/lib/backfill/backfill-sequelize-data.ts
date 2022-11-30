import { Op, FindOptions, Order, WhereOptions } from 'sequelize';
import { get, isNil, min } from 'lodash';
import redisClient from '../redis';
import logger from '../logger';
import * as Bluebird from 'bluebird';
import { dogstatsd } from '../datadog-statsd';
import { processInBatches } from '../utils';

export default function getBackfiller<T>({
  queryFn,
  publishFn,
  startId,
  minId,
  redisKey,
  concurrency,
  metricName,
  primaryKeyName,
  jobName,
}: {
  queryFn: (options: FindOptions) => Promise<T[]>;
  publishFn: (data: T) => Promise<void>;
  startId: number | null;
  minId: number;
  redisKey: string;
  concurrency: number;
  metricName: string;
  primaryKeyName?: string;
  jobName?: string;
}) {
  const impl = {
    getBatch: async (limit: number, offset: number, previous?: T[]): Promise<T[]> => {
      const where: WhereOptions = {};
      const order: Order = [['id', 'desc']];
      let maxId = null;
      if (previous?.length > 0) {
        maxId = min(previous.map(o => get(o, primaryKeyName ?? 'id') as number));
      } else if (!isNil(startId)) {
        maxId = startId;
      } else if (await redisClient.getAsync(redisKey)) {
        maxId = parseInt(await redisClient.getAsync(redisKey), 10);
      }

      if (maxId) {
        where[primaryKeyName ?? 'id'] = {
          [Op.lt]: maxId,
          [Op.gte]: minId,
        };
      }

      logger.info(`Fetching next batch starting at id: ${maxId} and descending to ${minId}.`);
      const rows = queryFn({
        where,
        limit,
        order,
      });

      await redisClient.setAsync(redisKey, maxId);
      return rows;
    },
    processBatch: async (data: T[]): Promise<void> => {
      await Bluebird.map(
        data,
        async item => {
          await publishFn(item);
          dogstatsd.increment(metricName, { jobName: jobName ?? '' });
        },
        { concurrency },
      );
    },
  };

  return async () => await processInBatches(impl.getBatch, impl.processBatch);
}
