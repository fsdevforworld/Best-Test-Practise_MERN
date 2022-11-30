import * as sinon from 'sinon';
import { clean } from '../../test-helpers';
import * as IPRateLimiter from '../../../src/api/v2/user/check-ip-rate-limit';
import { BaseDaveApiError, RateLimitError } from '@dave-inc/error-types';
import {
  validateExchangeRequest,
  validateLoginRequest,
  validateRefreshAccessRequest,
  validateRefreshTokenRequest,
} from '../../../src/services/sombra/validator';
import { expect } from 'chai';
import { IDaveRequest } from '../../../src/typings';
import * as UserRateLimiter from '../../../src/api/v2/user/rate-limit';
import { loginRateLimitKey, RateLimitValues } from '../../../src/api/v2/user/rate-limit';
import {
  InvalidCredentialsError,
  InvalidParametersError,
  UnauthenticatedError,
} from '../../../src/lib/error';
import { InvalidParametersMessageKey, RateLimitMessageKey } from '../../../src/translations';
import { dogstatsd } from '../../../src/lib/datadog-statsd';
import { RateLimiter } from '../../../src/lib/rate-limiter';
import { User } from '../../../src/models';
import { TokenIntrospection } from '@dave-inc/sombra-token-validator';
import { FailureType, InternalFailure } from '@dave-inc/sombra-token-validator';
// tslint:disable-next-line:no-require-imports
import MockExpressRequest = require('mock-express-request');
import logger from '../../../src/lib/logger';
import { fail } from 'assert';
import * as AccountStatus from '../../../src/domain/account-management/account-status';

describe('Sombra validator', () => {
  const sandbox = sinon.createSandbox();
  before(() => clean());
  afterEach(() => clean(sandbox));

  describe('validateLoginRequest', () => {
    describe('when neither email and phoneNumber are used in the request', async () => {
      const req = new MockExpressRequest({
        connection: {
          ip: '8.8.8.8',
        },
        headers: {
          'X-Device-Id': 'hi',
          'X-Device-Type': 'ios',
        },
        body: {
          password: 'hi',
        },
        query: {},
      });

      it('should reject the request', async () => {
        await expect(validateLoginRequest(req as IDaveRequest)).to.eventually.be.rejectedWith(
          InvalidParametersError,
        );
      });

      it('should send a stat indicating that the login method was invalid', async () => {
        const increment = sandbox.stub(dogstatsd, 'increment').resolves();
        try {
          await validateLoginRequest(req as IDaveRequest);
        } catch (e) {}
        expect(increment).to.have.been.calledWith('sombra.user_authenticate.type.invalid');
      });
    });

    describe('when both email and phoneNumber are used in the request', async () => {
      const req = new MockExpressRequest({
        connection: {
          ip: '8.8.8.8',
        },
        headers: {
          'X-Device-Id': 'hi',
          'X-Device-Type': 'ios',
        },
        body: {
          email: 'hi',
          phoneNumber: '+14446669999',
          password: 'hi',
        },
        query: {},
      });

      it('should reject the request if both email and phoneNumber are used', async () => {
        await expect(validateLoginRequest(req as IDaveRequest)).to.eventually.be.rejectedWith(
          InvalidParametersError,
        );
      });

      it('should send a stat indicating that the login method was invalid', async () => {
        const increment = sandbox.stub(dogstatsd, 'increment').resolves();
        try {
          await validateLoginRequest(req as IDaveRequest);
        } catch (e) {}
        expect(increment).to.have.been.calledWith('sombra.user_authenticate.type.invalid');
      });
    });

    describe('when the request has a phoneNumber which is an invalid phone number', async () => {
      const phoneNumbers = ['what phone number', null, '16262224444', 12345, 'hi', { hi: 'hi' }];
      for (const phoneNumber of phoneNumbers) {
        const req = new MockExpressRequest({
          connection: {
            ip: '8.8.8.8',
          },
          headers: {
            'X-Device-Id': 'hi',
            'X-Device-Type': 'ios',
          },
          body: {
            phoneNumber,
            password: 'hi',
          },
          query: {},
        });
        it(`should reject the request with an InvalidParametersError when phoneNumber: ${phoneNumber}`, async () => {
          await expect(validateLoginRequest(req as IDaveRequest)).to.eventually.be.rejectedWith(
            InvalidParametersError,
          );
        });
        it('should send a stat indicating that the login method was invalid', async () => {
          const increment = sandbox.stub(dogstatsd, 'increment').resolves();
          try {
            await validateLoginRequest(req as IDaveRequest);
          } catch (e) {}
          expect(increment).to.have.been.calledWith('sombra.user_authenticate.type.invalid');
        });
      }
    });

    describe('when the request has an invalid email', async () => {
      const emails = [12345, null, { hi: 'hi' }];
      for (const email of emails) {
        const req = new MockExpressRequest({
          connection: {
            ip: '8.8.8.8',
          },
          headers: {
            'X-Device-Id': 'hi',
            'X-Device-Type': 'ios',
          },
          body: {
            email,
            password: 'hi',
          },
          query: {},
        });

        it(`should reject the request with an InvalidParameterErrror when email is: ${email}`, async () => {
          await expect(validateLoginRequest(req as IDaveRequest)).to.eventually.be.rejectedWith(
            InvalidParametersError,
          );
        });

        it('should send a stat indicating that the login method was invalid', async () => {
          const increment = sandbox.stub(dogstatsd, 'increment').resolves();
          try {
            await validateLoginRequest(req as IDaveRequest);
          } catch (e) {}
          expect(increment).to.have.been.calledWith('sombra.user_authenticate.type.invalid');
        });
      }
    });

    describe('when password is missing in the request', async () => {
      const req = new MockExpressRequest({
        connection: {
          ip: '8.8.8.8',
        },
        headers: {
          'X-Device-Id': 'hi',
          'X-Device-Type': 'ios',
        },
        body: {
          email: 'hi',
        },
        query: {},
      });

      it('should reject the request', async () => {
        await expect(validateLoginRequest(req as IDaveRequest)).to.eventually.be.rejectedWith(
          InvalidParametersError,
        );
      });

      it('should send a stat indicating the login method', async () => {
        const increment = sandbox.stub(dogstatsd, 'increment').resolves();
        try {
          await validateLoginRequest(req as IDaveRequest);
        } catch (e) {}
        expect(increment).to.have.been.calledWith('sombra.user_authenticate.type.invalid');
      });
    });

    describe('when calling the ip rate limiter', async () => {
      const req = new MockExpressRequest({
        connection: {
          ip: '8.8.8.8',
        },
        headers: {
          'X-Device-Id': 'hi',
          'X-Device-Type': 'ios',
        },
        body: {
          email: 'hi',
          password: 'hi',
        },
        query: {},
      });

      it('should call checkIpRateLimit with the ip of the client', async () => {
        sandbox.stub(dogstatsd, 'increment').resolves();
        const stub = sandbox.stub(IPRateLimiter, 'checkIpRateLimit').rejects();
        try {
          await validateLoginRequest(req as IDaveRequest);
        } catch (e) {}
        expect(stub).to.have.been.calledWith(
          '8.8.8.8',
          RateLimitMessageKey.TooManyFailedLoginAttemptsTryLater,
        );
        expect(stub).to.have.been.calledOnce;
      });
    });

    describe('when calling the device id rate limiter', async () => {
      const emailReq = new MockExpressRequest({
        connection: {
          ip: '8.8.8.8',
        },
        headers: {
          'X-Device-Id': 'hi',
          'X-Device-Type': 'ios',
        },
        body: {
          email: 'hi',
          password: 'hi',
        },
        query: {},
      });
      const phoneReq = new MockExpressRequest({
        connection: {
          ip: '8.8.8.8',
        },
        headers: {
          'X-Device-Id': 'hi',
          'X-Device-Type': 'ios',
        },
        body: {
          phoneNumber: '6224445555',
          password: 'hi',
        },
        query: {},
      });
      const tests = [
        {
          req: emailReq,
          values: {
            email: 'hi',
            deviceId: 'hi',
          },
        },
        {
          req: phoneReq,
          values: {
            phoneNumber: '+16224445555',
            deviceId: 'hi',
          },
        },
      ];
      for (const test of tests) {
        it(`should pass in the expected args: ${JSON.stringify(test.values)}`, async () => {
          sandbox.stub(dogstatsd, 'increment').resolves();
          sandbox.stub(IPRateLimiter, 'checkIpRateLimit').resolves();
          const stub = sandbox.stub(UserRateLimiter, 'checkRateLimit').rejects();

          try {
            await validateLoginRequest(test.req as IDaveRequest);
          } catch (e) {}
          const args: {
            rateLimiter: RateLimiter;
            rateLimitValues: RateLimitValues;
            prefix: string;
            errorMessage: string;
            ip: string;
          } = stub.firstCall.args[0];
          expect(args.rateLimitValues).to.contain(test.values);
          expect(args.errorMessage).to.eq(RateLimitMessageKey.TooManyFailedLoginAttemptsTryLater);
          expect(args.prefix).to.eq(loginRateLimitKey);
          expect(args.ip).to.eq('8.8.8.8');
          expect(stub).to.have.been.calledOnce;
        });
      }
    });

    describe('when getting the remaining login attempts', async () => {
      const req = new MockExpressRequest({
        connection: {
          ip: '8.8.8.8',
        },
        headers: {
          'X-Device-Id': 'hi',
          'X-Device-Type': 'ios',
        },
        body: {
          email: 'hi',
          password: 'hi',
        },
        query: {},
      });

      it('should call getRemainingLoginAttemptsFromDeviceId with the expected args', async () => {
        sandbox.stub(dogstatsd, 'increment').resolves();
        sandbox.stub(IPRateLimiter, 'checkIpRateLimit').resolves();
        sandbox.stub(UserRateLimiter, 'checkRateLimit').resolves();
        const stub = sandbox
          .stub(UserRateLimiter, 'getRemainingLoginAttemptsFromDeviceId')
          .rejects();
        try {
          await validateLoginRequest(req as IDaveRequest);
        } catch (e) {}
        expect(stub.firstCall.args[0]).to.contain({
          email: 'hi',
          deviceId: 'hi',
        });
        expect(stub.firstCall.args[1]).to.eq(loginRateLimitKey);
      });
    });

    describe('when getting the user', async () => {
      const emailReq = new MockExpressRequest({
        connection: {
          ip: '8.8.8.8',
        },
        headers: {
          'X-Device-Id': 'hi',
          'X-Device-Type': 'ios',
        },
        body: {
          email: 'hi@hi.com',
          password: 'hi',
        },
        query: {},
      });

      const phoneNumberReq = new MockExpressRequest({
        connection: {
          ip: '8.8.8.8',
        },
        headers: {
          'X-Device-Id': 'hi',
          'X-Device-Type': 'ios',
        },
        body: {
          phoneNumber: '6269992222',
          password: 'hi',
        },
        query: {},
      });

      it('should call findOneByEmail when the login type is email', async () => {
        sandbox.stub(dogstatsd, 'increment').resolves();
        sandbox.stub(IPRateLimiter, 'checkIpRateLimit').resolves();
        sandbox.stub(UserRateLimiter, 'checkRateLimit').resolves();
        sandbox.stub(UserRateLimiter, 'getRemainingLoginAttemptsFromDeviceId').resolves();
        const stub = sandbox.stub(User, 'findOneByEmail').rejects();
        try {
          await validateLoginRequest(emailReq as IDaveRequest);
        } catch (e) {}
        expect(stub.firstCall.args[0]).to.eq('hi@hi.com');
      });

      it('should call findOneByPhoneNumber when the login type is phoneNumber', async () => {
        sandbox.stub(dogstatsd, 'increment').resolves();
        sandbox.stub(IPRateLimiter, 'checkIpRateLimit').resolves();
        sandbox.stub(UserRateLimiter, 'checkRateLimit').resolves();
        sandbox.stub(UserRateLimiter, 'getRemainingLoginAttemptsFromDeviceId').resolves();
        const stub = sandbox.stub(User, 'findOneByPhoneNumber').rejects();
        try {
          await validateLoginRequest(phoneNumberReq as IDaveRequest);
        } catch (e) {}
        expect(stub.firstCall.args[0]).to.eq('+16269992222');
      });

      it('should throw an exception if a user is not found', async () => {
        sandbox.stub(dogstatsd, 'increment').resolves();
        sandbox.stub(IPRateLimiter, 'checkIpRateLimit').resolves();
        sandbox.stub(UserRateLimiter, 'checkRateLimit').resolves();
        sandbox.stub(UserRateLimiter, 'getRemainingLoginAttemptsFromDeviceId').resolves();
        sandbox.stub(User, 'findOneByPhoneNumber').resolves(null);
        expect(validateLoginRequest(phoneNumberReq as IDaveRequest)).to.eventually.be.rejectedWith(
          InvalidCredentialsError,
          'Credentials provided are invalid.',
        );
      });
    });

    describe('when returning', async () => {
      const req = new MockExpressRequest({
        connection: {
          ip: '8.8.8.8',
        },
        headers: {
          'X-Device-Id': 'hi',
          'X-Device-Type': 'ios',
        },
        body: {
          phoneNumber: '6269992222',
          password: 'hi',
          mfaCode: '123456',
        },
        query: {},
      });
      it('should return the expected payload', async () => {
        sandbox.stub(dogstatsd, 'increment').resolves();
        sandbox.stub(IPRateLimiter, 'checkIpRateLimit').resolves();
        sandbox.stub(UserRateLimiter, 'checkRateLimit').resolves();
        sandbox.stub(UserRateLimiter, 'getRemainingLoginAttemptsFromDeviceId').resolves(5);
        sandbox.stub(User, 'findOneByPhoneNumber').resolves(new User({ id: 1 }));
        const result = await validateLoginRequest(req as IDaveRequest);
        expect(result.deviceId).to.eq('hi');
        expect(result.attemptsRemaining).to.eq(5);
        expect(result.password).to.eq('hi');
        expect(result.user).to.contain({ id: 1 });
        expect(result.mfaCode).to.be.eq('123456');
        expect(result.deviceType).to.be.eq('ios');
        expect(result.loginMethod).to.be.eq('phoneNumber');
      });
    });
  });

  describe('validateRefreshAccessRequest', () => {
    const req = new MockExpressRequest({
      connection: {
        ip: '8.8.8.8',
      },
      headers: {
        'X-Device-Id': 'hi',
        'X-Device-Type': 'ios',
        'X-Refresh-Token': 'hi',
      },
      body: {},
      query: {},
    });

    it('should reject the request when the X-Refresh-Token header is missing', async () => {
      const failReq = new MockExpressRequest({
        connection: {
          ip: '8.8.8.8',
        },
        headers: {
          'X-Device-Id': 'hi',
          'X-Device-Type': 'ios',
        },
        body: {},
        query: {},
      });
      expect(validateRefreshAccessRequest(failReq as IDaveRequest)).to.eventually.rejectedWith(
        InvalidParametersError,
        InvalidParametersMessageKey.BaseInvalidParametersError,
      );
    });

    it('should, if introspectRefreshToken throws an InternalFailure, throw an UnauthenticatedError', async () => {
      const loggerStub = sandbox.stub(logger, 'debug').resolves();
      const dogstatsdStub = sandbox.stub(dogstatsd, 'increment').resolves();
      const introspectRefreshToken = sandbox
        .stub(TokenIntrospection.prototype, 'introspectRefreshToken')
        .throws(new InternalFailure('sad', FailureType.TokenInvalidClaims));
      const getCoreAccountStatus = sandbox.stub(AccountStatus, 'getCoreAccountStatus');
      expect(validateRefreshAccessRequest(req as IDaveRequest)).to.eventually.rejectedWith(
        UnauthenticatedError,
      );
      expect(loggerStub.calledWith(sinon.match('[Validate-Refresh-Access] - Internal error: sad')))
        .to.be.true;
      expect(
        dogstatsdStub.calledWith(
          sinon.match('sombra.refresh_access_validate.failure.invalid_token.token_invalid_claims'),
        ),
      ).to.be.true;
      expect(introspectRefreshToken.calledOnce).to.be.true;
      expect(getCoreAccountStatus.called).to.be.false;
    });

    it('should, if introspectRefreshToken throws an unexpected Error, throw a BaseDaveApiError with a 502 status code', async () => {
      const loggerStub = sandbox.stub(logger, 'error').resolves();
      const dogstatsdStub = sandbox.stub(dogstatsd, 'increment').resolves();
      const introspectRefreshToken = sandbox
        .stub(TokenIntrospection.prototype, 'introspectRefreshToken')
        .throws(new Error('sad'));

      try {
        await validateRefreshAccessRequest(req as IDaveRequest);
        fail();
      } catch (e) {
        expect(e instanceof BaseDaveApiError).to.be.true;
        expect((e as BaseDaveApiError).statusCode).to.eq(502);
        expect(loggerStub.calledWith('[Validate-Refresh-Access] - Unexpected error: sad')).to.be
          .true;
        expect(dogstatsdStub.calledWith('sombra.refresh_access_validate.failure.unexpected_error'))
          .to.be.true;
        expect(introspectRefreshToken.calledOnce).to.be.true;
      }
    });

    it('should, throw an UnauthenticatedError if the user account is deleted', async () => {
      const loggerStub = sandbox.stub(logger, 'debug').resolves();
      const dogstatsdStub = sandbox.stub(dogstatsd, 'increment').resolves();
      const introspectRefreshToken = sandbox
        .stub(TokenIntrospection.prototype, 'introspectRefreshToken')
        .resolves({ userId: 1 });
      const getCoreAccountStatus = sandbox
        .stub(AccountStatus, 'getCoreAccountStatus')
        .resolves({ status: AccountStatus.CoreAccountStatus.DELETED });

      try {
        await validateRefreshAccessRequest(req as IDaveRequest);
        fail();
      } catch (e) {
        expect(e instanceof UnauthenticatedError).to.be.true;

        expect(loggerStub.calledWith('[Validate-Refresh-Access] - UserId 1 is deleted')).to.be.true;
        expect(dogstatsdStub.calledWith('sombra.refresh_access_validate.failure.user_deleted')).to
          .be.true;
        expect(introspectRefreshToken.calledOnce).to.be.true;
        expect(getCoreAccountStatus.calledOnce).to.be.true;
      }
    });

    it('should, throw an UnauthenticatedError if the user account is marked as fraud', async () => {
      const loggerStub = sandbox.stub(logger, 'debug').resolves();
      const dogstatsdStub = sandbox.stub(dogstatsd, 'increment').resolves();
      const introspectRefreshToken = sandbox
        .stub(TokenIntrospection.prototype, 'introspectRefreshToken')
        .resolves({ userId: 1 });
      const getCoreAccountStatus = sandbox
        .stub(AccountStatus, 'getCoreAccountStatus')
        .resolves({ status: AccountStatus.CoreAccountStatus.FRAUD });

      try {
        await validateRefreshAccessRequest(req as IDaveRequest);
        fail();
      } catch (e) {
        expect(e instanceof UnauthenticatedError).to.be.true;
        expect(loggerStub.calledWith('[Validate-Refresh-Access] - UserId 1 marked as fraud')).to.be
          .true;
        expect(dogstatsdStub.calledWith('sombra.refresh_access_validate.failure.user_fraud')).to.be
          .true;
        expect(introspectRefreshToken.calledOnce).to.be.true;
        expect(getCoreAccountStatus.calledOnce).to.be.true;
      }
    });

    it('should, return the refresh token if the account is active', async () => {
      const loggerStub = sandbox.stub(logger, 'debug').resolves();
      const dogstatsdStub = sandbox.stub(dogstatsd, 'increment').resolves();
      const introspectRefreshToken = sandbox
        .stub(TokenIntrospection.prototype, 'introspectRefreshToken')
        .resolves({ userId: 1 });
      const getCoreAccountStatus = sandbox
        .stub(AccountStatus, 'getCoreAccountStatus')
        .resolves({ status: AccountStatus.CoreAccountStatus.ACTIVE });

      expect(await validateRefreshAccessRequest(req as IDaveRequest)).to.deep.eq({
        refreshToken: 'hi',
      });
      expect(loggerStub.calledWith('[Validate-Refresh-Access] - UserId 1 is active')).to.be.true;
      expect(dogstatsdStub.calledWith('sombra.refresh_access_validate.success')).to.be.true;
      expect(introspectRefreshToken.calledOnce).to.be.true;
      expect(getCoreAccountStatus.calledOnce).to.be.true;
    });
  });

  describe('validateRefreshTokenRequest', () => {
    it('should reject the request when the X-Refresh-Token header is missing', () => {
      const req = new MockExpressRequest({
        connection: {
          ip: '8.8.8.8',
        },
        headers: {
          'X-Device-Id': 'hi',
          'X-Device-Type': 'ios',
        },
        body: {},
        query: {},
      });
      expect(() => validateRefreshTokenRequest(req as IDaveRequest)).to.throw(
        InvalidParametersError,
        InvalidParametersMessageKey.BaseInvalidParametersError,
      );
    });

    it('should accept the request when the X-Refresh-Token header is present and return a refresh token', () => {
      const req = new MockExpressRequest({
        connection: {
          ip: '8.8.8.8',
        },
        headers: {
          'X-Device-Id': 'hi',
          'X-Device-Type': 'ios',
          'X-Refresh-Token': 'sup',
        },
        body: {},
        query: {},
      });
      expect(validateRefreshTokenRequest(req as IDaveRequest)).to.contain({ refreshToken: 'sup' });
    });
  });

  describe('validateExchangeRequest', () => {
    const req = new MockExpressRequest({
      connection: {
        ip: '8.8.8.8',
      },
      headers: {
        'X-Device-Id': 'hi',
      },
      body: {},
      query: {},
    });

    it('should pass when all rate limiters pass', async () => {
      const ipRateLimiter = sandbox.stub(IPRateLimiter, 'checkIpRateLimit').resolves();
      const userRateLimiter = sandbox.stub(UserRateLimiter, 'checkRateLimit').resolves();

      await validateExchangeRequest(req as IDaveRequest);
      expect(ipRateLimiter).to.have.callCount(1);
      expect(ipRateLimiter).to.have.been.calledWith('8.8.8.8');
      expect(userRateLimiter).to.have.callCount(1);
      const userRateLimiterArgs = userRateLimiter.getCall(0).args;
      expect(userRateLimiterArgs[0].rateLimitValues).to.contain({ deviceId: 'hi' });
    });

    it('should throw a RateLimitError when checkIpRateLimit is hit', async () => {
      const stub = sandbox
        .stub(IPRateLimiter, 'checkIpRateLimit')
        .rejects(new RateLimitError('sad'));
      sandbox.stub(UserRateLimiter, 'checkRateLimit').resolves();
      await expect(validateExchangeRequest(req as IDaveRequest)).to.be.rejectedWith(RateLimitError);
      expect(stub).to.have.callCount(1);
    });

    it('should throw a RateLimitError when checkRateLimit is hit', async () => {
      sandbox.stub(IPRateLimiter, 'checkIpRateLimit').resolves();
      const stub = sandbox
        .stub(UserRateLimiter, 'checkRateLimit')
        .rejects(new RateLimitError('sad'));
      await expect(validateExchangeRequest(req as IDaveRequest)).to.be.rejectedWith(RateLimitError);
      expect(stub).to.have.callCount(1);
    });
  });
});
