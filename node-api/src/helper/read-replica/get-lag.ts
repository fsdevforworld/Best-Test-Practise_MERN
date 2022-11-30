import { isNil, memoize } from 'lodash';
import redisClient from '../../lib/redis';
import { ReplicaLagKey } from '../../crons/fetch-and-store-read-replica-lag';

const _getReadReplicaLag = memoize(async (_cacheKey: any) => {
  const value = await redisClient.getAsync(ReplicaLagKey);
  if (!isNil(value)) {
    return parseInt(value, 10);
  }

  return;
});

export async function getReadReplicaLag(
  cacheInMemory: boolean = true,
): Promise<number | undefined> {
  // This function will get called a lot, we only want to hit redis at most once every 30s
  // which is half the update period for this value (the cron job to update this value runs every minute)
  const key = cacheInMemory ? Math.floor(Date.now() / 30_000) : Date.now();
  return _getReadReplicaLag(key);
}
