import * as crypto from 'crypto';
import redisClient from '../lib/redis';

function userSessionKey(deviceId: string, token: string): string {
  const hash = crypto
    .createHash('sha256')
    .update(`${deviceId}-${token}`)
    .digest('hex');

  return `user_sessions:${hash}`;
}

export async function getRedisUserSession(deviceId: string, token: string): Promise<string> {
  const cacheKey = userSessionKey(deviceId, token);
  return redisClient.getAsync(cacheKey);
}

export async function setRedisUserSession(deviceId: string, token: string, userId: string) {
  const cacheKey = userSessionKey(deviceId, token);
  await redisClient.setexAsync(cacheKey, 3600, userId);
}
