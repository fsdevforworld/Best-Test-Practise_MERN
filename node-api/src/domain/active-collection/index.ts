import { isNil } from 'lodash';
import logger from '../../lib/logger';
import redisClient from '../../lib/redis';
import { wrapMetrics } from '../../lib/datadog-statsd';

const enum Metrics {
  Set = 'active-collection.set',
  TTL = 'active-collection.ttl',
  Error = 'active-collection.error',
}
const metrics = wrapMetrics<Metrics>();

export const ActiveCollectionPrefix = 'user-active-collection';
export const DefaultTTL = 7 * 24 * 60 * 60;

function getKey(userId: string): string {
  return `${ActiveCollectionPrefix}-${userId}`;
}

export async function setActiveCollection(
  userId: string,
  activeCollection: string,
  ttlSec: number = DefaultTTL,
): Promise<void> {
  await redisClient.setexAsync(getKey(userId), ttlSec, activeCollection);
  metrics.increment(Metrics.Set);
  metrics.histogram(Metrics.TTL, ttlSec);
}

export async function getActiveCollection(userId: string): Promise<string | null> {
  return redisClient.getAsync(getKey(userId));
}

export async function isActiveCollection(userId: string, collection: string): Promise<boolean> {
  let activeCollection: string | null = null;
  try {
    activeCollection = await getActiveCollection(userId);
  } catch (error) {
    logger.error('Failing open on getting active collection', {
      userId,
    });
    metrics.increment(Metrics.Error);
  }
  return isNil(activeCollection) || collection === activeCollection;
}
