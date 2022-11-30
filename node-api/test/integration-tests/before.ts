import redis from '../../src/lib/redis';

before(async () => {
  await redis.flushallAsync();
});
