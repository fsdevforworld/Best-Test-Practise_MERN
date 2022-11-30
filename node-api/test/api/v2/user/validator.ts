import { moment } from '@dave-inc/time-lib';
import { expect } from 'chai';
import * as config from 'config';
import { times } from 'lodash';
import * as sinon from 'sinon';
import {
  validateLoginRequest,
  validateResetPasswordRequest,
  validateVerifyAddressInfo,
  validateVerifyDaveBankingSSN,
  validateVerifyNumberRequest,
  validateAndParseGetUserRequest,
} from '../../../../src/api/v2/user/validator';
import { dogstatsd } from '../../../../src/lib/datadog-statsd';
import {
  InvalidParametersError,
  NotFoundError,
  RateLimitError,
  UnauthenticatedError,
} from '../../../../src/lib/error';
import { toE164 } from '../../../../src/lib/utils';
import { User, UserSession } from '../../../../src/models';
import * as sombraClient from '../../../../src/services/sombra/client';
import {
  InvalidParametersMessageKey,
  NotFoundMessageKey,
  RateLimitMessageKey,
} from '../../../../src/translations';
import { IDaveRequest } from '../../../../src/typings';
import factory from '../../../factories';
import { clean, stubBankTransactionClient, stubLoomisClient } from '../../../test-helpers';
import { VPN_IP } from './../../../../src/api/v2/user/rate-limit';

/* tslint:disable-next-line:no-require-imports */
import MockExpressRequest = require('mock-express-request');

describe('User Validator', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean(sandbox));
  beforeEach(() => {
    stubBankTransactionClient(sandbox);
    stubLoomisClient(sandbox);
  });
  afterEach(() => clean(sandbox));

  describe('validateResetPasswordRequest', () => {
    it('should throw an InvalidParametersError if neither email or phone number is found', async () => {
      const req = new MockExpressRequest({
        body: {},
      });

      await expect(validateResetPasswordRequest(req as IDaveRequest)).to.be.rejectedWith(
        InvalidParametersError,
        InvalidParametersMessageKey.MissingEmailOrPhoneNumber,
      );
    });

    it(
      'should find an exact account associated with an email containing a trailing space,' +
        ' even when the space is not provided as input, which is MySQL behavior',
      async () => {
        const email = 'cameron@dave.com';
        const emailWithSpace = email + ' ';
        const req = new MockExpressRequest({
          body: {
            email,
          },
        });
        await factory.create('user', { email: emailWithSpace });
        const returnedUser = await validateResetPasswordRequest(req as IDaveRequest);

        expect(returnedUser.email).to.be.eq(emailWithSpace);
      },
    );

    it('should return an InvalidParametersError if an email with a trailing space is passed in', async () => {
      const email = 'cameron@dave.com ';
      const req = new MockExpressRequest({
        body: {
          email,
        },
      });
      await expect(validateResetPasswordRequest(req as IDaveRequest)).to.be.rejectedWith(
        InvalidParametersError,
        InvalidParametersMessageKey.InvalidEmailEntry,
      );
    });

    it('should throw an InvalidParametersError if email is not in proper format', async () => {
      const email = 'jeff@ failure.com';
      const req = new MockExpressRequest({
        body: {
          email,
        },
      });

      await expect(validateResetPasswordRequest(req as IDaveRequest)).to.be.rejectedWith(
        InvalidParametersError,
        InvalidParametersMessageKey.InvalidEmailEntry,
      );
    });

    it('should throw an InvalidParametersError if phone number is not in proper format', async () => {
      const phoneNumber = '123';
      const req = new MockExpressRequest({
        body: {
          phoneNumber,
        },
      });
      await expect(validateResetPasswordRequest(req as IDaveRequest)).to.be.rejectedWith(
        InvalidParametersError,
        InvalidParametersMessageKey.InvalidPhoneNumberEntry,
      );
    });

    it('should return null if no user is found', async () => {
      const req = new MockExpressRequest({
        body: {
          phoneNumber: '1234567890',
        },
      });
      const returnedUser = await validateResetPasswordRequest(req as IDaveRequest);

      expect(returnedUser).to.be.null;
    });

    it('should return null if email is associated with deleted user', async () => {
      const email = 'jeff@jeff.com';
      const req = new MockExpressRequest({
        body: {
          email,
        },
      });
      await Promise.all([
        factory.create('user', { email, deleted: moment() }),
        factory.create('user', { email, deleted: moment().subtract(1, 'day') }),
      ]);
      const returnedUser = await validateResetPasswordRequest(req as IDaveRequest);

      expect(returnedUser).to.be.null;
    });

    it('should return null if phone is associated with deleted user', async () => {
      const rawPhoneNumber = '1234567890';
      const req = new MockExpressRequest({
        body: { phoneNumber: rawPhoneNumber },
      });
      await Promise.all([
        factory.create('user', { phoneNumber: '+11234567890-deleted-1', deleted: moment() }),
        factory.create('user', {
          phoneNumber: '+11234567890-deleted-2',
          deleted: moment().subtract(1, 'day'),
        }),
      ]);
      const returnedUser = await validateResetPasswordRequest(req as IDaveRequest);

      expect(returnedUser).to.be.null;
    });

    it('should return a non deleted user that matches email', async () => {
      const email = 'jeff@jeff.com';
      const req = new MockExpressRequest({
        body: {
          email,
        },
      });
      const [user] = await Promise.all([
        factory.create('user', { email }),
        factory.create('user', { email, deleted: moment() }),
        factory.create('user', { email, deleted: moment().subtract(1, 'day') }),
      ]);
      const returnedUser = await validateResetPasswordRequest(req as IDaveRequest);

      expect(returnedUser.id).to.be.eq(user.id);
      expect(returnedUser.email).to.be.eq(user.email);
    });

    it('should return a non deleted user that matches phone', async () => {
      const rawPhoneNumber = '1234567890';
      const phoneNumber = toE164(rawPhoneNumber);
      const req = new MockExpressRequest({
        body: { phoneNumber: rawPhoneNumber },
      });
      const [user] = await Promise.all([
        factory.create('user', { phoneNumber, email: 'jeff@jeff.com' }),
        factory.create('user', { phoneNumber: '+11234567890-deleted-1', deleted: moment() }),
        factory.create('user', {
          phoneNumber: '+11234567890-deleted-2',
          deleted: moment().subtract(1, 'day'),
        }),
      ]);
      const returnedUser = await validateResetPasswordRequest(req as IDaveRequest);

      expect(returnedUser.id).to.be.eq(user.id);
      expect(returnedUser.phoneNumber).to.be.eq(user.phoneNumber);
    });

    it('should throw an InvalidParametersError if email is invalid', async () => {
      const email = 'vince welnick@dead.net';
      const req = new MockExpressRequest({
        body: {
          email,
        },
      });
      await expect(validateResetPasswordRequest(req as IDaveRequest)).to.be.rejectedWith(
        InvalidParametersError,
        InvalidParametersMessageKey.InvalidEmailEntry,
      );
    });
  });

  describe('validateVerifyDaveBankingSSN', () => {
    it('should return the last four ssn and the user found if the request parameters without email are validated successfully', async () => {
      const user = await factory.create<User>('user');
      await factory.create('bank-of-dave-bank-connection', { userId: user.id });
      const ssnLast4 = '1234';
      const req = new MockExpressRequest({
        body: {
          ssnLast4,
          userId: user.id,
        },
      });

      const payload = await validateVerifyDaveBankingSSN(req as IDaveRequest);
      expect(payload.ssnLast4).to.be.eq(ssnLast4);
      expect(payload.user.id).to.be.eq(user.id);
    });

    it('should return the last four ssn and the user found if the request parameters with email are validated successfully', async () => {
      const user = await factory.create<User>('user', { email: 'allison@dave.com' });
      await factory.create('bank-of-dave-bank-connection', { userId: user.id });
      const ssnLast4 = '1234';
      const req = new MockExpressRequest({
        body: {
          ssnLast4,
          userId: user.id,
          recoveryEmail: 'allison@dave.com',
        },
      });

      const payload = await validateVerifyDaveBankingSSN(req as IDaveRequest);
      expect(payload.ssnLast4).to.be.eq(ssnLast4);
      expect(payload.user.id).to.be.eq(user.id);
    });

    it(
      'should return no errors when a user has a space at the end of their email but' +
        "the recoveryEmail doesn't contain the space",
      async () => {
        const email = 'space@dave.com';
        const emailWithSpace = email + ' ';
        const user = await factory.create<User>('user', { email: emailWithSpace });
        await factory.create('bank-of-dave-bank-connection', { userId: user.id });
        const ssnLast4 = '1234';
        const req = new MockExpressRequest({
          body: {
            ssnLast4,
            userId: user.id,
            recoveryEmail: email,
          },
        });

        const payload = await validateVerifyDaveBankingSSN(req as IDaveRequest);
        expect(payload.ssnLast4).to.be.eq(ssnLast4);
        expect(payload.user.id).to.be.eq(user.id);
        expect(payload.recoveryEmail).to.be.eq(email);
      },
    );

    it(
      'should return no errors when a user passes in a recovery email with trailing spaces' +
        'but has no trailing spaces in their email',
      async () => {
        const email = 'space@dave.com';
        const emailWithSpace = email + ' ';
        const user = await factory.create<User>('user', { email });
        await factory.create('bank-of-dave-bank-connection', { userId: user.id });
        const ssnLast4 = '1234';
        const req = new MockExpressRequest({
          body: {
            ssnLast4,
            userId: user.id,
            recoveryEmail: emailWithSpace,
          },
        });

        const payload = await validateVerifyDaveBankingSSN(req as IDaveRequest);
        expect(payload.ssnLast4).to.be.eq(ssnLast4);
        expect(payload.user.id).to.be.eq(user.id);
        expect(payload.recoveryEmail).to.be.eq(emailWithSpace);
      },
    );

    it(
      'should return no errors when a user has a trailing space on their email and' +
        'the recoveryEmail also contains the trailing space',
      async () => {
        const emailWithSpace = 'space@dave.com ';
        const user = await factory.create<User>('user', { email: emailWithSpace });
        await factory.create('bank-of-dave-bank-connection', { userId: user.id });
        const ssnLast4 = '1234';
        const req = new MockExpressRequest({
          body: {
            ssnLast4,
            userId: user.id,
            recoveryEmail: emailWithSpace,
          },
        });

        const payload = await validateVerifyDaveBankingSSN(req as IDaveRequest);
        expect(payload.ssnLast4).to.be.eq(ssnLast4);
        expect(payload.user.id).to.be.eq(user.id);
        expect(payload.recoveryEmail).to.be.eq(emailWithSpace);
      },
    );

    it('should throw an RateLimitError if the request was made too many times', async () => {
      const user = await factory.create<User>('user');
      await factory.create('bank-of-dave-bank-connection', { userId: user.id });
      const ssnLast4 = '1234';
      const req = new MockExpressRequest({
        body: {
          ssnLast4,
          userId: user.id,
        },
      });

      await Promise.all(times(5, async () => validateVerifyDaveBankingSSN(req as IDaveRequest)));

      await expect(validateVerifyDaveBankingSSN(req as IDaveRequest)).to.be.rejectedWith(
        RateLimitError,
        RateLimitMessageKey.TooManyVerifyBankSSNAttemptsTryLater,
      );
    });

    it('should throw a InvalidParametersError if the proper request parameters are not found', async () => {
      const req = new MockExpressRequest({
        body: {},
      });

      await expect(validateVerifyDaveBankingSSN(req as IDaveRequest)).to.be.rejectedWith(
        InvalidParametersError,
        InvalidParametersMessageKey.BaseInvalidParametersError,
      );
    });

    it('should throw a InvalidParametersError if the last four of the ssn is not 4 digits', async () => {
      const user = await factory.create<User>('user');
      const req = new MockExpressRequest({
        body: {
          ssnLast4: '123',
          userId: user.id,
        },
      });
      const datadogSpy = sandbox.spy(dogstatsd, 'increment');

      await expect(validateVerifyDaveBankingSSN(req as IDaveRequest)).to.be.rejectedWith(
        InvalidParametersError,
        InvalidParametersMessageKey.InvalidSSNLast4Format,
      );
      sinon.assert.calledWithExactly(
        datadogSpy,
        'user.verify_bank_ssn.failed.invalid_ssn_last_four_format',
      );
    });

    it('should throw a NotFoundError if a user could not be found', async () => {
      const req = new MockExpressRequest({
        body: {
          ssnLast4: '1234',
          userId: 1,
        },
      });
      const datadogSpy = sandbox.spy(dogstatsd, 'increment');

      await expect(validateVerifyDaveBankingSSN(req as IDaveRequest)).to.be.rejectedWith(
        NotFoundError,
        NotFoundMessageKey.UserNotFoundTryAgain,
      );
      sinon.assert.calledWithExactly(datadogSpy, 'user.verify_bank_ssn.failed.user_not_found');
    });

    it('should throw a NotFoundError if a dave banking user could not be found', async () => {
      const user = await factory.create<User>('user');
      const req = new MockExpressRequest({
        body: {
          ssnLast4: '1234',
          userId: user.id,
        },
      });
      const datadogSpy = sandbox.spy(dogstatsd, 'increment');

      await expect(validateVerifyDaveBankingSSN(req as IDaveRequest)).to.be.rejectedWith(
        NotFoundError,
        NotFoundMessageKey.DaveBankingUserNotFoundTryAgain,
      );
      sinon.assert.calledWithExactly(
        datadogSpy,
        'user.verify_bank_ssn.failed.user_not_dave_banking',
      );
    });

    it('should throw an UnauthenticatedError if submitted email does not match user email', async () => {
      const user = await factory.create<User>('user', { email: 'allison+real@dave.com' });
      await factory.create('bank-of-dave-bank-connection', { userId: user.id });
      const req = new MockExpressRequest({
        body: {
          ssnLast4: '1234',
          userId: user.id,
          recoveryEmail: 'allison+malicious@dave.com',
        },
      });
      const datadogSpy = sandbox.spy(dogstatsd, 'increment');

      await expect(validateVerifyDaveBankingSSN(req as IDaveRequest)).to.be.rejectedWith(
        UnauthenticatedError,
      );
      sinon.assert.calledWithExactly(
        datadogSpy,
        'user.verify_bank_ssn.failed.user_email_recovery_email_no_match',
      );
    });

    it('should NOT throw an UnauthenticatedError if submitted email casing does not match user email', async () => {
      const expectedEmailAddress = 'allison+real@dave.com';
      const expectedMisCasedEmailAddress = 'allison+reaL@dave.com';
      const user = await factory.create<User>('user', { email: expectedEmailAddress });
      await factory.create('bank-of-dave-bank-connection', { userId: user.id });
      const req = new MockExpressRequest({
        body: {
          ssnLast4: '1234',
          userId: user.id,
          recoveryEmail: expectedMisCasedEmailAddress,
        },
      });

      await validateVerifyDaveBankingSSN(req as IDaveRequest);
    });
  });

  describe('validateLoginRequest', () => {
    const ipLoginLimit = config.get<number>('rateLimits.loginsByIp.perHour');

    it('should throw an InvalidParametersError if missing X-Device-Id', async () => {
      const datadogSpy = sandbox.spy(dogstatsd, 'increment');
      const req = new MockExpressRequest({
        headers: { 'X-Device-Type': 'hi' },
        body: { phoneNumber: 'whatever', password: 'whatever' },
        connection: {
          ip: `${VPN_IP}1`,
        },
      });
      await expect(validateLoginRequest(req as IDaveRequest)).to.be.rejectedWith(
        InvalidParametersError,
      );
      expect(datadogSpy).to.have.been.calledWith('user.login_with_password.missing_params', [
        'X-Device-Id',
      ]);
    });

    it('should throw an InvalidParametersError if missing X-Device-Type', async () => {
      const datadogSpy = sandbox.spy(dogstatsd, 'increment');
      const req = new MockExpressRequest({
        headers: { 'X-Device-Id': 'hi' },
        body: { phoneNumber: 'whatever', password: 'whatever' },
        connection: {
          ip: `${VPN_IP}1`,
        },
      });
      await expect(validateLoginRequest(req as IDaveRequest)).to.be.rejectedWith(
        InvalidParametersError,
      );
      expect(datadogSpy).to.have.been.calledWith('user.login_with_password.missing_params', [
        'X-Device-Type',
      ]);
    });

    for (const body of [
      { phoneNumber: '1' },
      { email: '1' },
      { email: '1', phoneNumber: '1' },
      { password: '1' },
    ]) {
      it(`should throw an InvalidParametersError if body is ${JSON.stringify(body)}`, async () => {
        const datadogSpy = sandbox.spy(dogstatsd, 'increment');
        const req = new MockExpressRequest({
          headers: { 'X-Device-Id': 'hi', 'X-Device-Type': 'hi' },
          body,
          connection: {
            ip: `${VPN_IP}1`,
          },
        });
        await expect(validateLoginRequest(req as IDaveRequest)).to.be.rejectedWith(
          InvalidParametersError,
          InvalidParametersMessageKey.PasswordAndEmailOrPhone,
        );
        expect(datadogSpy.firstCall.args).to.contain('user.login_with_password.missing_params');
      });
    }

    it('should rate limit if the function is called 5 times with the same IP', async () => {
      const user = await factory.create('user', { password: 'password' });
      const req = new MockExpressRequest({
        headers: { 'X-Device-Id': 'hi', 'X-Device-Type': 'hi' },
        body: { phoneNumber: user.phoneNumber, password: user.password },
        connection: {
          ip: `${VPN_IP}1`,
        },
      });

      await Promise.all(
        times(ipLoginLimit, async n => {
          await validateLoginRequest(req as IDaveRequest);
        }),
      );

      await expect(validateLoginRequest(req as IDaveRequest)).to.be.rejectedWith(
        RateLimitError,
        RateLimitMessageKey.TooManyFailedLoginAttemptsTryLater,
      );
    });

    it('should not rate limit if the function is called 5 times with the same IP if they are on VPN', async () => {
      const user = await factory.create('user', { password: 'password' });
      const req = new MockExpressRequest({
        headers: { 'X-Device-Id': 'hi', 'X-Device-Type': 'hi' },
        body: { phoneNumber: user.phoneNumber, password: user.password },
        connection: {
          ip: VPN_IP,
        },
      });

      await Promise.all(
        times(ipLoginLimit, async n => {
          await validateLoginRequest(req as IDaveRequest);
        }),
      );

      await expect(validateLoginRequest(req as IDaveRequest)).to.not.be.rejected;
    });
  });

  describe('validateVerifyNumberRequest', () => {
    it('should throw a RateLimitError if the request was made too many times', async () => {
      const req = new MockExpressRequest({
        body: {
          phoneNumber: '1112223333',
        },
      });

      await Promise.all(times(5, async () => validateVerifyNumberRequest(req as IDaveRequest)));

      await expect(validateVerifyNumberRequest(req as IDaveRequest)).to.be.rejectedWith(
        RateLimitError,
        RateLimitMessageKey.TooManyRequests,
      );
    });
  });

  describe('validateVerifyAddressInfo', () => {
    it('should pass if address is complete', async () => {
      const body = {
        addressLine1: 'Super Jeff Ave',
        city: 'Ozarks',
        state: 'CA',
        zipCode: '91101',
      };
      const req = new MockExpressRequest({ body });
      const response = validateVerifyAddressInfo(req as IDaveRequest);
      expect(response).to.be.deep.eq({ ...body, addressLine2: undefined });
    });

    it('should throw an InvalidParametersError if address is incomplete', async () => {
      const req = new MockExpressRequest({
        body: {
          addressLine1: 'Super Jeff Ave',
          state: 'CA',
          zipCode: '91101',
        },
      });
      expect(() => validateVerifyAddressInfo(req as IDaveRequest)).to.throw(
        'BaseInvalidParametersError',
      );
    });
  });

  describe('validateAndParseGetUserRequest', () => {
    it('should NOT call exchangeSession', async () => {
      const exchangeStub = sandbox.stub(sombraClient, 'exchangeSession');
      const req = new MockExpressRequest({
        user: await factory.create<User>('user'),
        userToken: 'token',
      });
      await validateAndParseGetUserRequest(req as IDaveRequest);
      expect(exchangeStub.called).to.be.false;
    });

    describe('for the purposes of the Sombra migration', () => {
      it(
        'should call the get function of the UserSession table to get the users session ' +
          'token when it is not passed in the request',
        async () => {
          const deviceId = 'id';
          const deviceType = 'type';

          const user = await factory.create<User>('user');
          const userSession = await factory.create<UserSession>('user-session', {
            userId: user.id,
            deviceId,
            deviceType,
          });
          const getSession = sandbox.spy(User.prototype, 'getSession');

          const req = new MockExpressRequest({
            user,
            userToken: undefined,
            headers: {
              'X-Device-Id': deviceId,
              'X-Device-Type': deviceType,
            },
          });
          const resp = await validateAndParseGetUserRequest(req as IDaveRequest);
          expect(resp.userToken).to.eq(userSession.token);
          expect(getSession.called).to.be.true;
          expect(getSession.calledWith([user.id, deviceId, deviceType, false]));
        },
      );

      it('should return the session token when it is attached to the request', async () => {
        const deviceId = 'id';
        const deviceType = 'type';

        const user = await factory.create<User>('user');
        const userSession = await factory.create<UserSession>('user-session', {
          userId: user.id,
          deviceId,
          deviceType,
        });
        const getSession = sandbox.spy(User.prototype, 'getSession');
        const token = userSession.token + 'tokentokentoken';

        const req = new MockExpressRequest({
          user,
          userToken: token,
          headers: {
            'X-Device-Id': deviceId,
            'X-Device-Type': deviceType,
          },
        });
        const resp = await validateAndParseGetUserRequest(req as IDaveRequest);
        expect(resp.userToken).to.eq(token);
        expect(getSession.called).to.be.false;
      });

      it(
        'should not get a session from the UserSession table if the value for the Device Id or Device Type ' +
          'headers are not found in the table for the user',
        async () => {
          const user = await factory.create<User>('user');
          await factory.create<UserSession>('user-session', {
            userId: user.id,
            deviceId: 'id',
            deviceType: 'type',
          });
          const getSession = sandbox.spy(User.prototype, 'getSession');

          const req = new MockExpressRequest({
            user,
            userToken: undefined,
            headers: {
              'X-Device-Id': 'wrong',
              'X-Device-Type': 'wrong',
            },
          });
          const res = await validateAndParseGetUserRequest(req as IDaveRequest);
          expect(res.userToken).to.be.undefined;
          expect(getSession.called).to.be.true;
          expect(getSession.calledWith([user.id, 'wrong', 'wrong', false]));
        },
      );

      it(
        'should not get a session from the UserSession table if the value for the Device Id or Device Type ' +
          'headers are undefined',
        async () => {
          const user = await factory.create<User>('user');
          await factory.create<UserSession>('user-session', {
            userId: user.id,
          });
          const getSession = sandbox.spy(User.prototype, 'getSession');

          const req = new MockExpressRequest({
            user,
            userToken: undefined,
          });
          const res = await validateAndParseGetUserRequest(req as IDaveRequest);
          expect(res.userToken).to.be.undefined;
          expect(getSession.called).to.be.false;
        },
      );
    });
  });
});
