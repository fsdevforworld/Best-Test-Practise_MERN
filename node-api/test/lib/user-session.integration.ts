import { expect } from 'chai';
import redisClient from '../../src/lib/redis';
import { getRedisUserSession, setRedisUserSession } from '../../src/lib/user-sessions';

describe('user-session redis cache (integration)', () => {
  const deviceId = 'fake-device-id';
  const token = 'fake-device-token';

  beforeEach(() => redisClient.flushallAsync());
  after(() => redisClient.flushallAsync());

  it('should return falsy for an uncached key', async () => {
    const result = await getRedisUserSession(deviceId, token);
    expect(result).not.to.be.ok;
  });

  it('should return a cached user id', async () => {
    const expectedUserId = '123abc';
    await setRedisUserSession(deviceId, token, expectedUserId);

    const result = await getRedisUserSession(deviceId, token);
    expect(result).to.equal(expectedUserId);
  });

  it('should hash the device ID and token', async () => {
    await setRedisUserSession(deviceId, token, '456def');

    const keys = await redisClient.keysAsync('*');
    expect(keys).to.have.lengthOf(1);
    for (const key of keys) {
      expect(key).not.to.contain(deviceId);
      expect(key).not.to.contain(token);
    }
  });
});
