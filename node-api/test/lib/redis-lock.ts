import { lockAndRun, LockMode } from '../../src/lib/redis-lock';
import redis from '../../src/lib/redis';
import * as sinon from 'sinon';
import { expect } from 'chai';
import { moment } from '@dave-inc/time-lib';
import * as Bluebird from 'bluebird';

describe('redis lock', () => {
  const sandbox = sinon.createSandbox();

  before(() => redis.flushdbAsync());

  afterEach(async () => Promise.all([redis.flushdbAsync(), sandbox.restore()]));

  it('should return without calling a function if a lock is held with mode return', async () => {
    await redis.setAsync(['lock-1', moment().format()]);
    const func = sandbox.spy();
    await lockAndRun('lock-1', func, { mode: LockMode.RETURN });
    expect(func).to.not.have.been.called;
  });

  it('should call the function if no lock exists with mode return', async () => {
    const func = sandbox.spy();
    await lockAndRun('lock-1', func, { mode: LockMode.RETURN });
    expect(func).to.have.been.called;
  });

  it('should wait and call after the function ends with mode wait', async () => {
    await redis.setAsync(['lock-1', moment().format()]);
    const func = sandbox.spy();
    lockAndRun('lock-1', func, { mode: LockMode.WAIT, sleepSec: 1 });
    await Bluebird.delay(1000);
    expect(func).not.to.have.been.called;
    await redis.delAsync('lock-1');
    await Bluebird.delay(1000);
    expect(func).to.have.been.called;
  });

  it('should timeout and return completed false after the timeout limit in wait mode', async () => {
    await redis.setAsync(['lock-1', moment().format()]);
    const func = sandbox.spy();
    const stub = sandbox.stub(redis, 'getsetAsync').resolves(moment().format());

    const { completed } = await lockAndRun('lock-1', func, {
      mode: LockMode.WAIT,
      sleepSec: 1,
      maxWaitTimeSec: 3,
    });

    expect(completed).to.eq(false);
    expect(stub.callCount).to.eq(4);
  });

  it('should auto time out if the old lock is past the ttl', async () => {
    await redis.setAsync([
      'lock-1',
      moment()
        .subtract(61, 'seconds')
        .format(),
    ]);
    const func = sandbox.spy();
    await lockAndRun('lock-1', func, { mode: LockMode.WAIT, sleepSec: 1, maxWaitTimeSec: 3 });
    expect(func).to.have.been.called;
  });

  it('should clear the lock after the function runs', async () => {
    const lockHolder = () => {
      Bluebird.delay(1000);
    };
    const func = sandbox.spy();
    lockAndRun('lock-1', lockHolder, { mode: LockMode.WAIT });
    lockAndRun('lock-1', func, { mode: LockMode.WAIT, sleepSec: 1 });
    expect(func).not.to.have.been.called;
    const lock = await redis.getAsync('lock-1');
    expect(lock).not.to.eq(null);
    await Bluebird.delay(2000);
    expect(func).to.have.been.called;
    const noLock = await redis.getAsync('lock-1');
    expect(noLock).to.eq(null);
  });

  it('throws an error and clears the lock when an error is thrown', async () => {
    const func = () => Promise.reject('BACON');
    await expect(lockAndRun('lock-1', func, { mode: LockMode.WAIT })).to.be.rejectedWith('BACON');
    const noLock = await redis.getAsync('lock-1');
    expect(noLock).to.eq(null);
  });
});
