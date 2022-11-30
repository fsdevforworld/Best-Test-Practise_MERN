/*
  For a brief period in July 2019, users were registered with a different fingerprint
*/
import redis from '../../lib/redis';
import Constants from './constants';

const { SYNAPSEPAY_USER_FINGERPRINT_REDIS_KEY: key } = Constants;

export async function addToCache(userId: number): Promise<void> {
  await redis.saddAsync(key, userId.toString());
}

export async function isCached(userId: number): Promise<boolean> {
  if (!userId) {
    return false;
  }

  const result = await redis.sismemberAsync(key, `${userId}`);

  return Boolean(result);
}
