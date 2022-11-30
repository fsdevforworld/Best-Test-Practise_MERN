import * as Bluebird from 'bluebird';
import {
  checkRateLimitAndWait,
  getRateLimiter,
} from '../../../../src/domain/banking-data-source/plaid/limiter';
import { RateLimit } from 'ratelimit.js';
import * as sinon from 'sinon';
import { expect } from 'chai';
import { EASTERN_TIMEZONE, moment } from '@dave-inc/time-lib';

describe('plaid rate limiter', () => {
  const sandbox = sinon.createSandbox();

  afterEach(() => sandbox.restore());

  it('should cancel', async () => {
    const stub = sandbox.stub(RateLimit.prototype, 'incr').callsArgWith(1, null, true);
    const promise = checkRateLimitAndWait(120);
    await Bluebird.delay(2100);
    expect(stub.callCount).to.eq(3);
    await Bluebird.resolve(promise).cancel();
    await Bluebird.delay(2000);
    expect(stub.callCount).to.eq(3);
  });

  it('rate limiter should default to 20 and 30 limit', async () => {
    sandbox.useFakeTimers(new Date('2020-11-10'));
    const limiter = getRateLimiter();
    expect(limiter.rules[0].limit).to.eq(20);
  });

  it('should return once the rate limit succeeds', async () => {
    const stub = sandbox.stub(RateLimit.prototype, 'incr').callsArgWith(1, null, true);
    const promise = checkRateLimitAndWait(120);
    await Bluebird.delay(2000);
    stub.callsArgWith(1, null, false);
    await Bluebird.delay(1000);
    expect(promise.isResolved()).to.eq(true);
  });

  describe('getRateLimiter', () => {
    it('should return the increased limiter in the mornings on friday', () => {
      const time = moment()
        .tz(EASTERN_TIMEZONE)
        .hour(1)
        .day('friday')
        .toDate()
        .getTime();
      sandbox.useFakeTimers(time);
      expect(getRateLimiter().key).to.eq('default-plaid-get-balance-increased');
    });

    it('should return the regular limiter past 6', () => {
      const time = moment()
        .tz(EASTERN_TIMEZONE)
        .hour(7)
        .day('friday')
        .toDate()
        .getTime();
      sandbox.useFakeTimers(time);
      expect(getRateLimiter().key).to.eq('default-plaid-get-balance');
    });

    it('should not return the regular limiter at 4 on thursday', () => {
      const time = moment()
        .tz(EASTERN_TIMEZONE)
        .hour(4)
        .day('thursday')
        .toDate()
        .getTime();
      sandbox.useFakeTimers(time);
      expect(getRateLimiter().key).to.eq('default-plaid-get-balance');
    });
  });
});
