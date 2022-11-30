import * as sinon from 'sinon';
import { clean, stubLoomisClient } from '../../test-helpers';
import twilio from '../../../src/lib/twilio';
import * as SynapsepayLib from '../../../src/domain/synapsepay';
import * as Jobs from '../../../src/jobs/data';
import PlaidSource from '../../../src/domain/banking-data-source/plaid/integration';
import * as SombraClient from '../../../src/services/sombra/client';
import * as eventDomain from '../../../src/domain/event';
import * as config from 'config';
import * as fg from 'factory-girl';
import * as request from 'supertest';
import app from '../../../src/api';
import { expect } from 'chai';
import phoneNumberVerification from '../../../src/domain/phone-number-verification';
import { times } from 'lodash';
import { CUSTOM_ERROR_CODES } from '../../../src/lib/error';
import { toE164 } from '../../../src/lib/utils';
import * as SombraValidator from '../../../src/services/sombra/validator';
import { RateLimitError } from '@dave-inc/error-types';
import { SombraConfig } from '../../../src/services/sombra/config';
import { MockAuthenticationException, SombraMockClient } from '../../../src/services/sombra/mock';

describe('Sombra endpoints /auth/*', () => {
  const sandbox = sinon.createSandbox();
  before(() => clean());

  beforeEach(function() {
    this.mobileStub = sandbox.stub(twilio, 'getMobileInfo').resolves({ isMobile: true });
    sandbox.stub(SynapsepayLib, 'deleteSynapsePayUser').resolves();
    sandbox.stub(Jobs, 'createFraudCheckTask');
    sandbox.stub(Jobs, 'updateSynapsepayUserTask').resolves();
    sandbox.stub(PlaidSource.prototype, 'deleteNexus').resolves();
    sandbox.stub(eventDomain.userUpdatedEvent, 'publish').resolves();
    stubLoomisClient(sandbox);
  });

  afterEach(() => clean(sandbox));

  describe('DELETE /auth/v1/userAuth/revoke', async () => {
    it('should return a 400 response code when the X-Refresh-Token parameter is missing', async () => {
      const result = await request(app)
        .delete('/auth/v1/userAuth/revoke')
        .set('X-Device-Type', 'ios')
        .send();
      expect(result.status).to.equal(400);
    });

    it('should return a 204 response code when the client returns a 204', async () => {
      sandbox.stub(SombraClient, 'revoke').returns({ body: {}, statusCode: 204 });
      const result = await request(app)
        .delete('/auth/v1/userAuth/revoke')
        .set('X-Device-Type', 'ios')
        .set('X-Refresh-Token', 'ok')
        .send();
      expect(result.status).to.equal(204);
    });

    it('should return a 500 response code when the client returns a 500', async () => {
      sandbox.stub(SombraClient, 'revoke').returns({ body: {}, statusCode: 500 });
      const result = await request(app)
        .delete('/auth/v1/userAuth/revoke')
        .set('X-Device-Type', 'ios')
        .set('X-Refresh-Token', 'bad')
        .send();
      expect(result.status).to.equal(500);
    });
  });

  describe('POST /auth/v1/userAuth/exchange', async () => {
    it('should return a 429 on validation failure due to rate limiting', async () => {
      sandbox.stub(SombraValidator, 'validateExchangeRequest').rejects(new RateLimitError('hi'));

      const result = await request(app)
        .post('/auth/v1/userAuth/exchange')
        .set('X-Device-Type', 'ios')
        .send({});
      expect(result.status).to.equal(429);
    });

    it('should return the response code and body on a failure from the client', async () => {
      sandbox.stub(SombraValidator, 'validateExchangeRequest').resolves();
      sandbox.stub(SombraClient, 'exchange').returns({
        body: {},
        statusCode: 400,
      });

      const result = await request(app)
        .post('/auth/v1/userAuth/exchange')
        .set('X-Device-Type', 'ios')
        .send({});
      expect(result.status).to.equal(400);
    });

    it('should return the response code and body on a success from the client', async () => {
      const body = {
        accessToken: 'hi',
        refreshToken: 'hi',
      };
      sandbox.stub(SombraValidator, 'validateExchangeRequest').resolves();
      sandbox.stub(SombraClient, 'exchange').returns({
        body,
        statusCode: 200,
      });

      const result = await request(app)
        .post('/auth/v1/userAuth/exchange')
        .set('X-Device-Type', 'ios')
        .send({});
      expect(result.status).to.equal(200);
      expect(result.body).to.contain(body);
    });
  });

  describe('POST /auth/v1/userAuth/refreshAccess', async () => {
    it('should return a 400 response code when the X-Refresh-Token parameter is missing', async () => {
      const result = await request(app)
        .post('/auth/v1/userAuth/refreshAccess')
        .set('X-Device-Type', 'ios')
        .send();
      expect(result.status).to.equal(400);
    });

    it('should return a success response code and body coming back from the server if the refresh token passes validation', async () => {
      sandbox
        .stub(SombraClient, 'refreshAccess')
        .returns({ body: { accessToken: 'access-token' }, statusCode: 200 });
      sandbox
        .stub(SombraValidator, 'validateRefreshAccessRequest')
        .resolves({ refreshToken: 'refreshToken' });
      const result = await request(app)
        .post('/auth/v1/userAuth/refreshAccess')
        .set('X-Device-Type', 'ios')
        .set('X-Refresh-Token', 'refresh-token')
        .send();
      expect(result.status).to.equal(200);
      expect(JSON.stringify(result.body)).to.equal(JSON.stringify({ accessToken: 'access-token' }));
    });

    it('should return an exception response code and body coming back from the server if the refresh token passes validation', async () => {
      sandbox
        .stub(SombraClient, 'refreshAccess')
        .returns({ body: { message: 'Unauthorized' }, statusCode: 401 });
      sandbox
        .stub(SombraValidator, 'validateRefreshAccessRequest')
        .resolves({ refreshToken: 'refreshToken' });
      const result = await request(app)
        .post('/auth/v1/userAuth/refreshAccess')
        .set('X-Device-Type', 'ios')
        .set('X-Refresh-Token', 'refresh-token')
        .send();
      expect(result.status).to.equal(401);
      expect(JSON.stringify(result.body)).to.equal(JSON.stringify({ message: 'Unauthorized' }));
    });
  });

  describe('POST /auth/v1/userAuth/authenticate', async () => {
    const appVersion = config.get<string>('minAppVersion.login');
    const ipLoginLimit = config.get<number>('rateLimits.loginsByIp.perHour');

    const testUser = await fg.factory.create('user', {
      email: 'lol@lol123.com',
      phoneNumber: '+16269992222',
    });
    const testUserPassword = 'jeffDaBest123!';
    await testUser.setPassword(testUserPassword);
    await testUser.save();

    it('should call SombraMockClient userAuthenticate, not exchange when isMockEnvironment is true. It should also return a 200', async () => {
      sandbox.stub(SombraConfig, 'isMockEnvironment').returns(true);
      const userAuthenticateStub = sandbox
        .stub(SombraMockClient, 'userAuthenticate')
        .resolves({ accessToken: 'hi', refreshToken: 'hi' });
      const exchangeSessionStub = sandbox.stub(SombraClient, 'exchangeSession');

      const result = await request(app)
        .post('/auth/v1/userAuth/authenticate')
        .set('X-Device-Id', testUser.id)
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', appVersion)
        .send({ email: testUser.email, password: testUserPassword });
      expect(result.status).to.equal(200);
      expect(userAuthenticateStub.callCount).to.be.eq(1);
      expect(userAuthenticateStub.args[0][0]).to.be.eq(testUser.id);
      expect(exchangeSessionStub.called).to.be.eq(false);
    });

    it('should call exchange, not SombraMockClient userAuthenticate when isMockEnvironment is false', async () => {
      sandbox.stub(SombraConfig, 'isMockEnvironment').returns(false);
      const userAuthenticateStub = sandbox.stub(SombraMockClient, 'userAuthenticate');
      const exchangeSessionStub = sandbox
        .stub(SombraClient, 'exchangeSession')
        .returns({ accessToken: 'hi', refreshToken: 'hi' });

      const result = await request(app)
        .post('/auth/v1/userAuth/authenticate')
        .set('X-Device-Id', testUser.id)
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', appVersion)
        .send({ email: testUser.email, password: testUserPassword });
      expect(result.status).to.equal(200);
      expect(exchangeSessionStub.callCount).to.be.eq(1);
      expect(userAuthenticateStub.called).to.be.eq(false);
    });

    /*
     * When userAuthenticate throws an exception, this could indicate that in production or staging we've enabled
     * the creation of mock tokens, which likely requires a code level fix.
     */
    it('should return a 500 when isMockEnvironment is true but an exception is thrown by SombraMockClient userAuthenticate', async () => {
      sandbox.stub(SombraConfig, 'isMockEnvironment').returns(true);
      sandbox
        .stub(SombraMockClient, 'userAuthenticate')
        .rejects(new MockAuthenticationException('hi'));

      const result = await request(app)
        .post('/auth/v1/userAuth/authenticate')
        .set('X-Device-Id', testUser.id)
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', appVersion)
        .send({ email: testUser.email, password: testUserPassword });
      expect(result.status).to.equal(500);
    });

    it(
      'should return 200 in with a valid email, password, and known device id ' +
        'when the exchangeSession call returns a 200',
      async () => {
        sandbox.stub(SombraConfig, 'isMockEnvironment').returns(false);
        sandbox.stub(SombraClient, 'exchangeSession').returns({
          body: {
            accessToken: 'temp',
            refreshToken: 'temp',
          },
          statusCode: 200,
        });
        const user = await fg.factory.create('user', { email: 'jeffrey@lee.com' });
        const password = 'jeffDaBest123!';
        await user.setPassword(password);
        await user.save();

        const result = await request(app)
          .post('/auth/v1/userAuth/authenticate')
          .set('X-Device-Id', user.id)
          .set('X-Device-Type', 'ios')
          .set('X-App-Version', appVersion)
          .send({ email: user.email, password });
        expect(result.status).to.equal(200);
      },
    );

    it(
      'should return 200 in with a valid phoneNumber, password, and known device id ' +
        'when the exchangeSession call returns a 200',
      async () => {
        sandbox.stub(SombraConfig, 'isMockEnvironment').returns(false);
        sandbox.stub(SombraClient, 'exchangeSession').returns({
          body: {
            accessToken: 'temp',
            refreshToken: 'temp',
          },
          statusCode: 200,
        });
        const user = await fg.factory.create('user', {
          email: 'jeffrey@lee.com',
          phoneNumber: '+16268882222',
        });
        const password = 'jeffDaBest123!';
        await user.setPassword(password);
        await user.save();

        const result = await request(app)
          .post('/auth/v1/userAuth/authenticate')
          .set('X-Device-Id', user.id)
          .set('X-Device-Type', 'ios')
          .set('X-App-Version', appVersion)
          .send({ email: user.phoneNumber, password });
        expect(result.status).to.equal(200);
      },
    );

    it(
      'should return 401 in with a valid email, password, and known device id but,' +
        ' the session generated becomes invalid and exchange returns 401',
      async () => {
        sandbox.stub(SombraConfig, 'isMockEnvironment').returns(false);
        sandbox.stub(SombraClient, 'exchangeSession').returns({
          body: {
            message: 'Unauthorized',
          },
          statusCode: 401,
        });

        const user = await fg.factory.create('user', { email: 'jeffrey@lee.com' });
        const password = 'jeffDaBest123!';
        await user.setPassword(password);
        await user.save();

        const result = await request(app)
          .post('/auth/v1/userAuth/authenticate')
          .set('X-Device-Id', user.id)
          .set('X-Device-Type', 'ios')
          .set('X-App-Version', appVersion)
          .send({ email: user.email, password });
        expect(result.status).to.equal(401);
      },
    );

    it('should return 401 in with an invalid email and password combination', async () => {
      sandbox.stub(SombraConfig, 'isMockEnvironment').returns(false);
      const user = await fg.factory.create('user', { email: 'jeffrey@lee.com' });
      const password = 'jeffDaBest123!';
      await user.setPassword(password);
      await user.save();

      const result = await request(app)
        .post('/auth/v1/userAuth/authenticate')
        .set('X-Device-Id', user.id)
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', appVersion)
        .send({ email: 'nope', password: 'nope' });
      expect(result.status).to.equal(401);
    });

    it('should return 401 in with an invalid phoneNumber and password combination', async () => {
      sandbox.stub(SombraConfig, 'isMockEnvironment').returns(false);
      const user = await fg.factory.create('user', { phoneNumber: '+16268882222' });
      const password = 'jeffDaBest123!';
      await user.setPassword(password);
      await user.save();

      const result = await request(app)
        .post('/auth/v1/userAuth/authenticate')
        .set('X-Device-Id', user.id)
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', appVersion)
        .send({ phoneNumber: 'nope', password: 'nope' });
      expect(result.status).to.equal(401);
    });

    it('should return 400 in with a missing email or phoneNumber', async () => {
      sandbox.stub(SombraConfig, 'isMockEnvironment').returns(false);
      const user = await fg.factory.create('user', { email: 'jeffrey@lee.com' });
      const password = 'jeffDaBest123!';
      await user.setPassword(password);
      await user.save();

      const result = await request(app)
        .post('/auth/v1/userAuth/authenticate')
        .set('X-Device-Id', user.id)
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', appVersion)
        .send({ password: 'nope' });
      expect(result.status).to.equal(400);
    });

    it('should return 400 in with a missing password', async () => {
      sandbox.stub(SombraConfig, 'isMockEnvironment').returns(false);
      const user = await fg.factory.create('user', { email: 'jeffrey@lee.com' });
      const password = 'jeffDaBest123!';
      await user.setPassword(password);
      await user.save();

      const result = await request(app)
        .post('/auth/v1/userAuth/authenticate')
        .set('X-Device-Id', user.id)
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', appVersion)
        .send({ email: 'nope' });
      expect(result.status).to.equal(400);
    });

    it('should return 401 with a new device id, send an mfa code, and indicate an mfa code is required', async () => {
      sandbox.stub(SombraConfig, 'isMockEnvironment').returns(false);
      const deliverStub = sandbox.stub(phoneNumberVerification, 'deliver').resolves();
      sandbox
        .stub(config, 'get')
        .withArgs('rateLimits.loginsByIp.perHour')
        .returns(10)
        .withArgs('phoneNumbers.shouldSendVerificationCode')
        .returns(true);
      const user = await fg.factory.create('user', { email: 'jeffrey@lee.com' });
      const password = 'jeffDaBest123!';
      await user.setPassword(password);
      await user.save();

      const result = await request(app)
        .post('/auth/v1/userAuth/authenticate')
        .set('X-Device-Id', 'yeehaw')
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', appVersion)
        .send({ email: user.email, password });
      expect(result.body).to.contain({ name: 'mfa_required_for_login' });
      expect(result.status).to.equal(401);
      expect(deliverStub).to.have.callCount(1);
    });

    it(`should rate limit login after ${ipLoginLimit} attempts with the same email address`, async () => {
      sandbox.stub(SombraConfig, 'isMockEnvironment').returns(false);
      const user = await fg.factory.create('user', { email: `ip-limit-test@dave.com` });
      const requests = await Promise.all(
        times(ipLoginLimit + 1, async n => {
          return request(app)
            .post('/auth/v1/userAuth/authenticate')
            .ok(res => [401, 200, 429].includes(res.status))
            .set('X-Device-Id', `${n}`)
            .set('X-Device-Type', `${user.id}`)
            .set('X-Forwarded-For', '192.168.2.1')
            .set('X-App-Version', appVersion)
            .send({ email: user.email, password: 'foo' });
        }),
      );

      const ratelimitedRequests = requests.filter(req => req.status === 429);
      expect(ratelimitedRequests.length).to.equal(1);
    });

    it('should rate limit login after 5 failed attempts with the same device ID', async () => {
      sandbox.stub(SombraConfig, 'isMockEnvironment').returns(false);
      const requests = await Promise.all(
        times(ipLoginLimit + 1, async n => {
          const user = await fg.factory.create('user', { email: `ip-limit-test-${n}@dave.com` });
          return request(app)
            .post('/auth/v1/userAuth/authenticate')
            .ok(res => [401, 200, 429].includes(res.status))
            .set('X-Device-Id', 'device-id')
            .set('X-Device-Type', `${user.id}`)
            .set('X-Forwarded-For', `192.168.2.1`)
            .set('X-App-Version', appVersion)
            .send({ email: user.email, password: 'foo' });
        }),
      );

      const ratelimitedRequests = requests.filter(req => req.status === 429);
      expect(ratelimitedRequests.length).to.equal(1);
    });

    it('should throw InvalidCredentialsError if no active user is found with that email', async () => {
      sandbox.stub(SombraConfig, 'isMockEnvironment').returns(false);
      const result = await request(app)
        .post('/auth/v1/userAuth/authenticate')
        .set('X-Device-Id', 'bar')
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', appVersion)
        .send({ email: 'jeff@jeff.com', password: 'jeffDaBest123!' });
      expect(result.status).to.equal(401);
      expect(result.body.type).to.equal('invalid_credentials');
      expect(result.body.customCode).to.equal(CUSTOM_ERROR_CODES.USER_INVALID_CREDENTIALS);
      expect(result.body.message).to.match(/Credentials provided are invalid\./);
    });

    it('should throw UnauthorizedError if user is flagged with fraud', async () => {
      sandbox.stub(SombraConfig, 'isMockEnvironment').returns(false);
      const user = await fg.factory.create('user', {
        email: 'jeffrey@lee.com',
        password: 'jeffDaBest',
        fraud: true,
      });

      const result = await request(app)
        .post('/auth/v1/userAuth/authenticate')
        .set('X-Device-Id', 'bar')
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', appVersion)
        .send({ email: user.email, password: user.password });
      expect(result.status).to.equal(403);
      expect(result.body.message).to.match(/Please contact customer service/);
    });

    it('should throw InvalidCredentialsError if password does not match', async () => {
      sandbox.stub(SombraConfig, 'isMockEnvironment').returns(false);
      const user = await fg.factory.create('user', {
        email: 'jeffrey@lee.com',
        password: 'jeffDaBest',
      });

      const result = await request(app)
        .post('/auth/v1/userAuth/authenticate')
        .set('X-Device-Id', 'bar')
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', appVersion)
        .send({ email: user.email, password: 'wrong password' });
      expect(result.status).to.equal(401);
      expect(result.body.type).to.equal('invalid_credentials');
      expect(result.body.customCode).to.equal(CUSTOM_ERROR_CODES.USER_INVALID_CREDENTIALS);
      expect(result.body.message).to.match(/Credentials provided are invalid\./);
    });

    it('should ask for MFA login the user with email and password login', async () => {
      sandbox.stub(SombraConfig, 'isMockEnvironment').returns(false);
      const deliverStub = sandbox.stub(phoneNumberVerification, 'deliver').resolves();
      sandbox
        .stub(config, 'get')
        .withArgs('rateLimits.loginsByIp.perHour')
        .returns(10)
        .withArgs('phoneNumbers.shouldSendVerificationCode')
        .returns(true);

      sandbox.stub(SombraClient, 'exchangeSession').returns({
        body: {
          accessToken: 'temp',
          refreshToken: 'temp',
        },
        statusCode: 200,
      });
      const user = await fg.factory.create(
        'user',
        { email: 'jeffrey@lee.com' },
        { hasSession: false },
      );
      const password = 'jeffDaBest123!';
      await user.setPassword(password);
      await user.save();

      const result = await request(app)
        .post('/auth/v1/userAuth/authenticate')
        .set('X-Device-Id', 'bar')
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', appVersion)
        .send({ email: user.email, password });
      expect(result.status).to.equal(401);
      expect(result.body.type).to.equal('mfa_required_for_login');
      expect(result.body.customCode).to.equal(CUSTOM_ERROR_CODES.USER_MFA_REQUIRED_FOR_LOGIN);
      expect(deliverStub).to.have.callCount(1);

      const verification = await phoneNumberVerification.find(toE164(user.phoneNumber));
      const result2 = await request(app)
        .post('/auth/v1/userAuth/authenticate')
        .set('X-Device-Id', user.id)
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', appVersion)
        .send({ email: user.email, password, mfaCode: verification.code });
      expect(result2.status).to.equal(200);
    });

    it('should ask for MFA login the user with email and password login and fail with wrong mfa code', async () => {
      sandbox.stub(SombraConfig, 'isMockEnvironment').returns(false);
      const deliverStub = sandbox.stub(phoneNumberVerification, 'deliver').resolves();
      sandbox
        .stub(config, 'get')
        .withArgs('rateLimits.loginsByIp.perHour')
        .returns(10)
        .withArgs('phoneNumbers.shouldSendVerificationCode')
        .returns(true);
      const user = await fg.factory.create(
        'user',
        { email: 'jeffrey@lee.com' },
        { hasSession: false },
      );
      const password = 'jeffDaBest123!';
      await user.setPassword(password);
      await user.save();

      const result = await request(app)
        .post('/auth/v1/userAuth/authenticate')
        .set('X-Device-Id', 'bar')
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', appVersion)
        .send({ email: user.email, password });
      expect(result.status).to.equal(401);
      expect(result.body.type).to.equal('mfa_required_for_login');
      expect(result.body.customCode).to.equal(CUSTOM_ERROR_CODES.USER_MFA_REQUIRED_FOR_LOGIN);
      expect(deliverStub).to.have.callCount(1);

      const mfaCode = 123456;
      const result2 = await request(app)
        .post('/auth/v1/userAuth/authenticate')
        .set('X-Device-Id', user.id)
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', appVersion)
        .send({ email: user.email, password, mfaCode });
      expect(result2.status).to.equal(401);
      expect(result2.body.type).to.equal('invalid_code');
      expect(result2.body.customCode).to.equal(CUSTOM_ERROR_CODES.USER_INVALID_CREDENTIALS);
    });
  });
});
