import { expect } from 'chai';
import * as config from 'config';
import * as sinon from 'sinon';
import { clean } from '../../../test-helpers';
import { RateLimitError } from '../../../../src/lib/error';
import { RateLimitMessageKey } from '../../../../src/translations';
import { dogstatsd } from '../../../../src/lib/datadog-statsd';
import { createRateLimiter, checkRateLimit, VPN_IP } from '../../../../src/api/v2/user/rate-limit';
import * as Utils from '../../../../src/lib/utils';

describe('Rate Limiting', () => {
  const sandbox = sinon.createSandbox();
  const prefix = 'JeffAlpha';

  before(() => clean(sandbox));
  afterEach(() => clean(sandbox));

  describe('checkRateLimit', () => {
    it('should not throw an error if it is the VPN', async () => {
      const rateLimiter = createRateLimiter(prefix, [{ interval: 60, limit: 1 }]);
      const rateLimitValues = { ip: VPN_IP, deviceId: 'JeffPhonePro11' };
      const dogstatSpy = sandbox.spy(dogstatsd, 'increment');
      await checkRateLimit({
        rateLimiter,
        rateLimitValues,
        errorMessage: RateLimitMessageKey.TooManyVerifyBankSSNAttemptsTryLater,
        prefix,
        ip: VPN_IP,
      });
      await checkRateLimit({
        rateLimiter,
        rateLimitValues,
        errorMessage: RateLimitMessageKey.TooManyVerifyBankSSNAttemptsTryLater,
        prefix,
        ip: VPN_IP,
      });
      sinon.assert.notCalled(dogstatSpy);
    });

    it('should return true if it is hit too many times with the provided values', async () => {
      const rateLimiter = createRateLimiter(prefix, [{ interval: 60, limit: 1 }]);
      const rateLimitValues = { ip: '172.27.999.1', deviceId: 'JeffPhonePro11' };
      const dogstatSpy = sandbox.spy(dogstatsd, 'increment');
      await checkRateLimit({
        rateLimiter,
        rateLimitValues,
        errorMessage: RateLimitMessageKey.TooManyVerifyBankSSNAttemptsTryLater,
        prefix,
        ip: `${VPN_IP}1`,
      });
      await expect(
        checkRateLimit({
          rateLimiter,
          rateLimitValues,
          errorMessage: RateLimitMessageKey.TooManyVerifyBankSSNAttemptsTryLater,
          prefix,
          ip: `${VPN_IP}1`,
        }),
      ).to.be.rejectedWith(
        RateLimitError,
        RateLimitMessageKey.TooManyVerifyBankSSNAttemptsTryLater,
      );
      sinon.assert.calledWith(dogstatSpy, `rate_limit_error.${prefix}`);
    });

    it('should return true if it is hit too many times even if one of the values is different', async () => {
      const rateLimiter = createRateLimiter(prefix, [{ interval: 60, limit: 1 }]);
      const rateLimitValues = { ip: `${VPN_IP}1`, deviceId: 'JeffPhonePro11' };
      const dogstatSpy = sandbox.spy(dogstatsd, 'increment');
      await checkRateLimit({
        rateLimiter,
        rateLimitValues,
        errorMessage: RateLimitMessageKey.TooManyVerifyBankSSNAttemptsTryLater,
        prefix,
        ip: `${VPN_IP}1`,
      });
      const otherRateLimitValues = { ip: `${VPN_IP}2`, deviceId: 'JeffPhonePro11' };
      await expect(
        checkRateLimit({
          rateLimiter,
          rateLimitValues: otherRateLimitValues,
          errorMessage: RateLimitMessageKey.TooManyVerifyBankSSNAttemptsTryLater,
          prefix,
          ip: `${VPN_IP}1`,
        }),
      ).to.be.rejectedWith(
        RateLimitError,
        RateLimitMessageKey.TooManyVerifyBankSSNAttemptsTryLater,
      );
      sinon.assert.calledWith(dogstatSpy, `rate_limit_error.${prefix}`);
    });

    it('should return true if on the VPN but hitting production env', async () => {
      const rateLimiter = createRateLimiter(prefix, [{ interval: 60, limit: 1 }]);
      const rateLimitValues = { ip: `${VPN_IP}`, deviceId: 'JeffPhonePro11' };
      sandbox.stub(Utils, 'isProdEnv').returns(true);
      sandbox.stub(Utils, 'isStagingEnv').returns(false);
      sandbox.stub(Utils, 'isDevEnv').returns(false);
      sandbox.stub(Utils, 'isTestEnv').returns(false);
      const dogstatSpy = sandbox.spy(dogstatsd, 'increment');
      await checkRateLimit({
        rateLimiter,
        rateLimitValues,
        errorMessage: RateLimitMessageKey.TooManyVerifyBankSSNAttemptsTryLater,
        prefix,
        ip: `${VPN_IP}`,
      });
      await expect(
        checkRateLimit({
          rateLimiter,
          rateLimitValues,
          errorMessage: RateLimitMessageKey.TooManyVerifyBankSSNAttemptsTryLater,
          prefix,
          ip: `${VPN_IP}`,
        }),
      ).to.be.rejectedWith(
        RateLimitError,
        RateLimitMessageKey.TooManyVerifyBankSSNAttemptsTryLater,
      );
      sinon.assert.calledWith(dogstatSpy, `rate_limit_error.${prefix}`);
    });

    it('should not rate limit if skipRateLimit in the config is true', async () => {
      const rateLimiter = createRateLimiter(prefix, [{ interval: 60, limit: 1 }]);
      const rateLimitValues = { deviceId: 'JeffPhonePro11' };
      const dogstatSpy = sandbox.spy(dogstatsd, 'increment');
      sandbox
        .stub(config, 'get')
        .withArgs('skipRateLimit')
        .returns(true);
      await checkRateLimit({
        rateLimiter,
        rateLimitValues,
        errorMessage: 'some error',
        prefix,
        ip: VPN_IP,
      });
      await expect(
        checkRateLimit({
          rateLimiter,
          rateLimitValues,
          errorMessage: 'some error',
          prefix,
          ip: VPN_IP,
        }),
      ).to.not.be.rejected;
      sinon.assert.notCalled(dogstatSpy);
    });

    it('should not rate limit if on VPN and calling staging env', async () => {
      sandbox.stub(Utils, 'isStagingEnv').returns(true);
      sandbox.stub(Utils, 'isProdEnv').returns(false);
      sandbox.stub(Utils, 'isDevEnv').returns(false);
      sandbox.stub(Utils, 'isTestEnv').returns(false);
      const rateLimiter = createRateLimiter(prefix, [{ interval: 60, limit: 1 }]);
      const rateLimitValues = { ip: `${VPN_IP}`, deviceId: 'JeffPhonePro11' };
      const dogstatSpy = sandbox.spy(dogstatsd, 'increment');
      await checkRateLimit({
        rateLimiter,
        rateLimitValues,
        errorMessage: 'some error',
        prefix,
        ip: VPN_IP,
      });
      await expect(
        checkRateLimit({
          rateLimiter,
          rateLimitValues,
          errorMessage: 'some error',
          prefix,
          ip: VPN_IP,
        }),
      ).to.not.be.rejected;
      sinon.assert.notCalled(dogstatSpy);
    });

    it('should not rate limit if on VPN and calling dev env', async () => {
      sandbox.stub(Utils, 'isDevEnv').returns(true);
      sandbox.stub(Utils, 'isProdEnv').returns(false);
      sandbox.stub(Utils, 'isStagingEnv').returns(false);
      sandbox.stub(Utils, 'isTestEnv').returns(false);
      const rateLimiter = createRateLimiter(prefix, [{ interval: 60, limit: 1 }]);
      const rateLimitValues = { ip: `${VPN_IP}`, deviceId: 'JeffPhonePro11' };
      const dogstatSpy = sandbox.spy(dogstatsd, 'increment');
      await checkRateLimit({
        rateLimiter,
        rateLimitValues,
        errorMessage: 'some error',
        prefix,
        ip: VPN_IP,
      });
      await expect(
        checkRateLimit({
          rateLimiter,
          rateLimitValues,
          errorMessage: 'some error',
          prefix,
          ip: VPN_IP,
        }),
      ).to.not.be.rejected;
      sinon.assert.notCalled(dogstatSpy);
    });

    it('should not rate limit if on VPN and calling test env', async () => {
      sandbox.stub(Utils, 'isTestEnv').returns(true);
      sandbox.stub(Utils, 'isProdEnv').returns(false);
      sandbox.stub(Utils, 'isStagingEnv').returns(false);
      sandbox.stub(Utils, 'isDevEnv').returns(false);
      const rateLimiter = createRateLimiter(prefix, [{ interval: 60, limit: 1 }]);
      const rateLimitValues = { ip: `${VPN_IP}`, deviceId: 'JeffPhonePro11' };
      const dogstatSpy = sandbox.spy(dogstatsd, 'increment');
      await checkRateLimit({
        rateLimiter,
        rateLimitValues,
        errorMessage: 'some error',
        prefix,
        ip: VPN_IP,
      });
      await expect(
        checkRateLimit({
          rateLimiter,
          rateLimitValues,
          errorMessage: 'some error',
          prefix,
          ip: VPN_IP,
        }),
      ).to.not.be.rejected;
      sinon.assert.notCalled(dogstatSpy);
    });
  });
});
