import redis from './redis';
import * as Bluebird from 'bluebird';
import { moment } from '@dave-inc/time-lib';
import { dogstatsd } from './datadog-statsd';

export enum LockMode {
  WAIT = 'WAIT',
  RETURN = 'RETURN',
}

/**
 * Function that will create a temporary lock in redis for a given function. This guarantees that
 * this function will only run if there is no other function holding the current lock key within the
 * ttl window
 *
 * @param lockKey
 * @param processFunc
 * @param options
 */
export async function lockAndRun<T = void>(
  lockKey: string,
  processFunc: () => T | Promise<T>,
  {
    maxWaitTimeSec = 30,
    sleepSec = 2,
    lockTtlSec = 60,
    mode = LockMode.WAIT,
  }: { mode?: LockMode; maxWaitTimeSec?: number; sleepSec?: number; lockTtlSec?: number } = {},
): Promise<{ completed: boolean; result?: T }> {
  const now = moment();
  const record = await redis.getsetAsync(lockKey, now.format());

  // this is a safety net in case for some reason we crash before we set the ttl and the del never gets called
  const ttlExpired = now.diff(moment(record), 'seconds') > lockTtlSec;

  if (ttlExpired) {
    dogstatsd.increment('redis_lock.ttl_expired');
  }

  if (!record || ttlExpired) {
    await redis.setAsync([lockKey, now.format(), 'EX', lockTtlSec.toString()]);
    try {
      return { completed: true, result: await processFunc() };
    } finally {
      await redis.delAsync(lockKey);
    }
  }

  dogstatsd.increment('redis_lock.lock_found');

  if (mode === LockMode.RETURN) {
    return { completed: false };
  }

  if (maxWaitTimeSec <= 0) {
    dogstatsd.increment('redis_lock.wait_time_exceeded');

    return { completed: false };
  }

  await Bluebird.delay(sleepSec * 1000);

  return lockAndRun(lockKey, processFunc, {
    maxWaitTimeSec: maxWaitTimeSec - sleepSec,
    sleepSec,
    lockTtlSec,
    mode,
  });
}
