import { expect } from 'chai';
import {
  sendCodeRateLimiterKey,
  validateSendMfaCodeRequest,
} from '../../../../../src/api/v2/user/send-verification/validator';
import * as Utils from '../../../../../src/lib/utils';
import { IDaveRequest } from '../../../../../src/typings';
/* tslint:disable-next-line:no-require-imports */
import MockExpressRequest = require('mock-express-request');
import { fail } from 'assert';
import { InvalidParametersError } from '@dave-inc/error-types';
import * as sinon from 'sinon';
import { clean } from '../../../../test-helpers';
import * as RateLimit from '@api/v2/user/rate-limit';
import { InvalidParametersMessageKey } from '../../../../../src/translations';
import { RateLimitError } from '../../../../../src/lib/error';
import { BaseDaveApiError } from '@dave-inc/error-types/src/index';

describe('User Send Verification Validator', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());
  afterEach(() => clean(sandbox));

  describe('validateSendMfaCodeRequest', () => {
    it('should return a phone number and email address when passed a request an email and a valid phone number', async () => {
      sandbox.stub(RateLimit, 'checkRateLimit').resolves();
      const req = new MockExpressRequest({
        body: { phoneNumber: '6267772222', email: 'foo@bar.com' },
      });
      const payload = await validateSendMfaCodeRequest(req as IDaveRequest);
      expect(payload.email).to.eq('foo@bar.com');
      expect(payload.phoneNumber).to.eq('+16267772222');
    });

    it('should return a phone number and either undefined or null email when passed a request with a valid phone number and an undefined/null email', async () => {
      sandbox.stub(RateLimit, 'checkRateLimit').resolves();
      let email: string;
      for (email of [undefined, null]) {
        const req = new MockExpressRequest({
          body: { phoneNumber: '6267772222', email },
        });
        const payload = await validateSendMfaCodeRequest(req as IDaveRequest);
        expect(payload.email).to.eq(email);
        expect(payload.phoneNumber).to.eq('+16267772222');
      }
    });

    it('should transform valid phoneNumbers to E164 format', async () => {
      sandbox.stub(RateLimit, 'checkRateLimit').resolves();
      for (const phoneNumber of ['6267772222', '+16267772222']) {
        const req = new MockExpressRequest({
          body: { phoneNumber },
        });
        const payload = await validateSendMfaCodeRequest(req as IDaveRequest);
        expect(payload.email).to.be.undefined;
        expect(payload.phoneNumber).to.eq('+16267772222');
      }
    });

    it('should throw an InvalidParametersError when passed a request with an invalid phone number', async () => {
      sandbox.stub(RateLimit, 'checkRateLimit').resolves();
      const validatePhoneNumber = sandbox.spy(Utils, 'validatePhoneNumber');
      for (const phoneNumber of ['g a r b a g e', '19992221111', '1234']) {
        const req = new MockExpressRequest({
          body: { phoneNumber },
        });
        try {
          await validateSendMfaCodeRequest(req as IDaveRequest);
          fail('Expected InvalidParametersError');
        } catch (e) {
          expect(validatePhoneNumber.lastCall.calledWith(phoneNumber)).to.be.true;
          expect(e instanceof InvalidParametersError);
          expect((e as InvalidParametersError).message).to.eq(
            InvalidParametersMessageKey.InvalidPhoneNumberEntry,
          );
        }
      }
    });

    it('should throw an InvalidParametersError when passed a request with an incorrectly typed phone number', async () => {
      sandbox.stub(RateLimit, 'checkRateLimit').resolves();
      for (const phoneNumber of [null, undefined, 12345, {}]) {
        const req = new MockExpressRequest({
          body: { phoneNumber },
        });
        try {
          await validateSendMfaCodeRequest(req as IDaveRequest);
          fail('Expected InvalidParametersError');
        } catch (e) {
          expect(e instanceof InvalidParametersError);
          expect((e as InvalidParametersError).message).to.eq(
            InvalidParametersMessageKey.InvalidPhoneNumberEntry,
          );
        }
      }
    });

    it('should throw an InvalidParametersError when passed a request with a valid phone number and an incorrectly typed email', async () => {
      sandbox.stub(RateLimit, 'checkRateLimit').resolves();
      for (const email of [12345, {}]) {
        const req = new MockExpressRequest({
          body: { phoneNumber: '6667779999', email },
        });
        try {
          await validateSendMfaCodeRequest(req as IDaveRequest);
          fail('Expected InvalidParametersError');
        } catch (e) {
          expect(e instanceof InvalidParametersError);
          expect((e as InvalidParametersError).message).to.eq(
            InvalidParametersMessageKey.InvalidEmailEntry,
          );
        }
      }
    });

    it('should throw an InvalidParametersError when passed a request with an invalid email address', async () => {
      sandbox.stub(RateLimit, 'checkRateLimit').resolves();
      const validateEmail = sandbox.spy(Utils, 'validateEmail');
      for (const email of ['garbage', '9991112222', 'fake\n@email.com', 'f%f.com']) {
        const req = new MockExpressRequest({
          body: { phoneNumber: '+16778889999', email },
        });
        try {
          await validateSendMfaCodeRequest(req as IDaveRequest);
          fail('Expected InvalidParametersError');
        } catch (e) {
          expect(validateEmail.lastCall.calledWith(email)).to.be.true;
          expect(e instanceof InvalidParametersError);
          expect((e as InvalidParametersError).message).to.eq(
            InvalidParametersMessageKey.InvalidEmailEntry,
          );
        }
      }
    });

    it('should throw an RateLimitError when checkRateLimit throws a RateLimitError', async () => {
      sandbox.stub(RateLimit, 'checkRateLimit').rejects(new RateLimitError('truly rate limited'));
      const req = new MockExpressRequest({
        body: { phoneNumber: '+16778889999', email: 'test@test.com' },
        connection: {
          ip: '127.0.0.1',
        },
      });
      try {
        await validateSendMfaCodeRequest(req as IDaveRequest);
        fail('Expected RateLimitError');
      } catch (e) {
        expect(e instanceof RateLimitError);
        expect((e as BaseDaveApiError).message).to.eq('truly rate limited');
      }
    });

    it('should call checkRateLimit with both the ip and deviceId', async () => {
      const checkRateLimit = sandbox.stub(RateLimit, 'checkRateLimit').resolves();
      const ip = '127.0.0.1';
      const deviceId = 'hi';
      const req = new MockExpressRequest({
        headers: { 'X-Device-Id': deviceId },
        body: { phoneNumber: '+16778889999', email: 'test@test.com' },
        connection: {
          ip,
        },
      });
      await validateSendMfaCodeRequest(req as IDaveRequest);
      expect(checkRateLimit.lastCall.args[0].rateLimitValues).to.contain({
        deviceId,
        ip: '127.0.0.1',
      });
      expect(checkRateLimit.lastCall.args[0].prefix).to.eq(sendCodeRateLimiterKey);
      expect(checkRateLimit.lastCall.args[0].ip).to.eq('127.0.0.1');
    });

    it('should call checkRateLimit with the request ip, even if deviceId is undefined', async () => {
      const checkRateLimit = sandbox.stub(RateLimit, 'checkRateLimit').resolves();
      const ip = '10.22.161.7';
      const req = new MockExpressRequest({
        body: { phoneNumber: '+16778889999', email: 'test@test.com' },
        connection: {
          ip,
        },
      });
      await validateSendMfaCodeRequest(req as IDaveRequest);
      expect(checkRateLimit.lastCall.args[0].rateLimitValues).to.contain({ ip: '10.22.161.7' });
      expect(checkRateLimit.lastCall.args[0].prefix).to.eq(sendCodeRateLimiterKey);
      expect(checkRateLimit.lastCall.args[0].ip).to.eq('10.22.161.7');
    });
  });
});
