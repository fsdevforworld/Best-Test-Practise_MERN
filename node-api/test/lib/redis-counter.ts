import redisClient from '../../src/lib/redis';
import { expect } from 'chai';
import RedisCounter from '../../src/lib/redis-counter';

const TEST_COUNTER_KEY = 'test-key';

let counter: RedisCounter;

describe('RedisCounter', () => {
  beforeEach(async () => {
    await redisClient.delAsync(TEST_COUNTER_KEY);

    counter = new RedisCounter(TEST_COUNTER_KEY);
  });

  describe('increment', () => {
    it('creates and increments a value if it doesnt exist', async () => {
      await counter.increment();

      const result = await counter.getValue();

      expect(result).to.equal(1);
      expect(result).to.not.equal('1');
    });
  });

  describe('getValue', () => {
    it('returns a number for the value', async () => {
      for (let i = 0; i < 10; i++) {
        await counter.increment();
      }

      const result = await counter.getValue();

      expect(result).to.equal(10);
      expect(result).to.not.equal('10');
    });

    it('returns zero if trying to get a value that hasnt been set yet', async () => {
      const result = await counter.getValue();

      expect(result).to.equal(0);
      expect(result).to.not.equal('0');
    });
  });
});
