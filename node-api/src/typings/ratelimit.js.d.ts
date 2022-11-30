declare module 'ratelimit.js' {
  import { RedisClient } from 'redis';
  class RateLimit {
    public incr: (toLimit: string, callback: (err: Error, isRateLimited: boolean) => any) => any;
    public check: (toLimit: string, callback: (err: Error, isRateLimited: boolean) => any) => any;
    constructor(
      redis: RedisClient,
      rules: Array<{ interval: number; limit: number; precision?: number }>,
    );
  }
}
