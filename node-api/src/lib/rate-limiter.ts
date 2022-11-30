import { RateLimit } from 'ratelimit.js';
import { RateLimitError } from '../lib/error';
import { dogstatsd } from '../lib/datadog-statsd';
import redisClient from './redis';
import { memoize } from 'lodash';

type CheckLimitProperties = {
  key: string;
  message: string;
  stat: string;
};

export class RateLimiter {
  public getLimiter = memoize(() => {
    return new RateLimit(redisClient, this.rules);
  });

  constructor(
    public key: string,
    public rules: Array<{ interval: number; limit: number; precision?: number }>,
  ) {}

  public isRateLimited(uniqueKey?: string): Promise<boolean> {
    let key = this.key;
    const limiter = this.getLimiter();

    return new Promise((resolve, reject) => {
      if (uniqueKey) {
        key = `${key}:${JSON.stringify(uniqueKey)}`;
      }

      limiter.incr(key, (err: Error, limited: boolean) => {
        if (err) {
          reject(err);
        }
        resolve(limited);
      });
    });
  }

  public async getAttemptsRemaining(uniqueKey?: string) {
    let key = this.key;
    if (uniqueKey) {
      key = `ratelimit:${key}:${JSON.stringify(uniqueKey)}`;
    }

    const values = await redisClient.hgetallAsync(key);
    return this.rules.map(({ interval, limit, precision }) => {
      const count = parseInt(values?.[`${interval}:${precision}:`], 10) || 0;
      return { interval, attemptsLeft: limit - count };
    });
  }

  public async incrementAndCheckLimit({ key, message, stat }: CheckLimitProperties): Promise<void> {
    const hitLimit = await this.isRateLimited(key);
    if (hitLimit) {
      dogstatsd.increment(stat);
      throw new RateLimitError(message);
    }
  }

  public async checkLimit(uniqueKey: string): Promise<boolean> {
    let key = this.key;
    const limiter = this.getLimiter();
    return new Promise((resolve, reject) => {
      if (uniqueKey) {
        key = `${key}:${JSON.stringify(uniqueKey)}`;
      }

      limiter.check(key, (error, value) => {
        if (error) {
          reject(error);
        }
        resolve(value);
      });
    });
  }
}
