import { expect } from 'chai';
import redisClient from '../../src/lib/redis';
import { setRedisUserSession } from '../../src/lib/user-sessions';
import * as sinon from 'sinon';

describe('user-session redis cache (unit)', () => {
  const deviceId = 'fake-device-id';
  const token = 'fake-device-token';

  const sandbox = sinon.createSandbox();

  let setexStub: sinon.SinonSpy;
  beforeEach(() => {
    setexStub = sandbox.stub(redisClient, 'setexAsync').resolves();
  });

  afterEach(() => sandbox.restore());

  it('should hash the device ID and token for a cached session', async () => {
    const expectedUserId = '456def';
    await setRedisUserSession(deviceId, token, expectedUserId);

    expect(setexStub).to.be.calledOnce;
    const [cacheKey, , userId] = setexStub.firstCall.args;
    expect(cacheKey).not.to.contain(deviceId);
    expect(cacheKey).not.to.contain(token);
    expect(userId).to.equal(expectedUserId);
  });
});
