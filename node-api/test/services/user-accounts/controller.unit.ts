import Sinon, * as sinon from 'sinon';
import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import * as SombraClient from '../../../src/services/sombra/client';
import logger from '../../../src/lib/logger';
import * as request from 'supertest';
import app from '../../../src/api';
import * as UserValidator from '../../../src/api/v2/user/validator';
import { RateLimitError } from '@dave-inc/error-types';
import { ValidCreateUserPayload } from '../../api/v2/user/typings';
import * as UserController from '../../../src/api/v2/user/controller';

// tslint:disable-next-line: ban
describe('[User Accounts Service] ~/users/*', async () => {
  let sandbox: sinon.SinonSandbox;
  let userValidatorStub: Sinon.SinonStub | undefined;
  let sombraClientExchangeStub: Sinon.SinonStub | undefined;
  let createUserStub: Sinon.SinonStub | undefined;
  let logDebug: Sinon.SinonSpy | undefined;
  let logError: Sinon.SinonSpy | undefined;

  const MockValidHeaders = {
    deviceId: 'foo',
    deviceType: 'bar',
    appsflyerDeviceId: 'whatever',
    appVersion: '1.0.0',
  };

  const MockValidFormData = {
    email: 'claiborne@dave.com',
    phoneNumber: '1234567890',
    password: '#s3cur3',
    firstName: 'Claiborne',
    lastName: 'Flinn',
  };

  const MockValidRegisterRequest = {
    ...MockValidHeaders,
    postData: {
      ...MockValidFormData,
    },
  };

  const MockCreateUserPayload: ValidCreateUserPayload = {
    ...MockValidHeaders,
    ...MockValidFormData,
  };

  before(async () => {
    sandbox = sinon.createSandbox();
  });

  use(() => chaiAsPromised);

  const makeUserRegistrationRequest = async ({
    deviceId,
    appVersion,
    deviceType,
    appsflyerDeviceId,
    postData = MockValidFormData,
  }: any) => {
    const result = await request(app)
      .post('/users/register')
      .set('X-Device-Id', deviceId)
      .set('X-Device-Type', deviceType)
      .set('X-App-Version', appVersion)
      .set('X-AppsFlyer-ID', appsflyerDeviceId)
      .send(postData);
    // tslint:disable-next-line: no-console
    console.debug(`[UserAccounts.Registration] Result:\n\n${JSON.stringify(result.body, null, 2)}`);
    return result;
  };

  afterEach(async () => {
    sandbox.restore();
    sandbox.reset();
  });

  beforeEach(async () => {
    userValidatorStub = sandbox.stub(UserValidator, 'validateNewUserRequest');
    sombraClientExchangeStub = sandbox.stub(SombraClient, 'exchangeSession');
    createUserStub = sandbox.stub(UserController, 'createUser');
    logDebug = sandbox.spy(logger, 'debug');
    logError = sandbox.spy(logger, 'error');
  });

  describe('POST /users/register', async () => {
    it('should return a 429 on validation failure due to rate limiting', async () => {
      userValidatorStub.rejects(new RateLimitError('too fast, please slow down'));

      const result = await makeUserRegistrationRequest(MockValidRegisterRequest);

      expect(result.status).to.equal(429);
      expect(logError).to.have.been.called;
    });

    it('should return the response code 200 and the user registration details/tokens upon success', async () => {
      userValidatorStub.resolves(MockCreateUserPayload);
      createUserStub.resolves({
        user: {
          ...MockValidFormData,
          createdAt: new Date(),
          id: 804804,
        },
        userToken: 'MOCK_USER_TOKEN',
        deviceId: MockValidHeaders.deviceId,
        deviceType: MockValidHeaders.deviceType,
      });
      sombraClientExchangeStub.resolves({
        body: { accessToken: 'ABC', refreshToken: 'XYZ' },
        statusCode: 200,
      });

      const result = await makeUserRegistrationRequest(MockValidRegisterRequest);

      expect(result.status).to.equal(200);
      expect(result.body).to.have.property('id');
      expect(result.body).to.have.property('createdAt');
      expect(result.body).to.have.property('accessToken', 'ABC');
      expect(result.body).to.have.property('refreshToken', 'XYZ');
      expect(result.body).to.have.property('firstName', 'Claiborne');
      expect(result.body).to.have.property('lastName', 'Flinn');
      expect(result.body).to.have.property('email', 'claiborne@dave.com');
      expect(result.body).to.have.property('phoneNumber', '1234567890');
      expect(result.body).to.have.property('hasPassword', true);
      expect(logDebug).to.have.been.called;
    });

    it('should return the response code 500 and an error message when the token exchange fails', async () => {
      userValidatorStub.resolves(MockCreateUserPayload);
      createUserStub.resolves({
        user: {
          ...MockValidFormData,
          createdAt: new Date(),
          id: 804804,
        },
        userToken: 'MOCK_USER_TOKEN',
        deviceId: MockValidHeaders.deviceId,
        deviceType: MockValidHeaders.deviceType,
      });
      sombraClientExchangeStub.rejects(
        Error('Unable to exchange that token for some strange reason!'),
      );

      const result = await makeUserRegistrationRequest(MockValidRegisterRequest);

      expect(result.status).to.equal(500);
      expect(result.body).to.have.property('message');
      expect(result.body.message).to.contain(
        `Registration Error! Please contact customer support. Reference ID:`,
      );
      expect(logError).to.have.been.called;
    });
  });
});
