import * as request from 'supertest';
import * as Faker from 'faker';
import * as sinon from 'sinon';
import authService from '../../src/services/run';
import { expect } from 'chai';
import 'mocha';
import { clean, stubLoomisClient, up } from '../test-helpers';
import factory from '../../test/factories';
import { generateToken } from '../test-helpers/sombra';
import { SombraTokenValidator } from '../../src/middleware/sombra-token-validator';
import * as sombraClient from '../../src/services/sombra/client';
import redis from '../../src/lib/redis';
import { User } from '../../src/models';
import UserHelper from '../../src/helper/user';
import { SombraConfig } from '../../src/services/sombra/config';

describe('User Auth Service', () => {
  const sandbox = sinon.createSandbox();

  // clean everything before we start
  before(() => clean());

  // insert user and user_session data
  beforeEach(() => {
    return up();
  });

  //truncate user and user_session data
  afterEach(() => clean(sandbox));

  describe('GET /auth', () => {
    it("should succeed if the user's credentials are correct", async () => {
      const user = await factory.create(
        'user',
        {
          legacyId: 100,
          email: () => Faker.internet.email(),
          emailVerified: true,
          firstName: () => Faker.name.firstName(1),
          lastName: () => Faker.name.lastName(1),
          addressLine1: () => Faker.address.streetAddress(),
          addressLine2: 'Apt 1',
          city: () => Faker.address.city(),
          state: () => Faker.address.stateAbbr(),
          zipCode: () => Faker.address.zipCode(),
          birthdate: () => Faker.date.past(10, '1975-01-01').toISOString(),
        },
        { hasSession: true },
      );
      const result = await request(authService)
        .get('/services/v1/auth')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id);

      expect(result.status).to.equal(200);
      expect(result.body.id).to.equal(user.id);
      expect(result.body.legacyId).to.equal(100);
      expect(result.body.synapseUserId).to.not.equal(null);
      expect(result.body.emailVerified).to.equal(true);
      expect(result.body.email).to.not.equal(null);
      expect(result.body.phoneNumber).to.not.equal(null);
      expect(result.body.firstName).to.not.equal(null);
      expect(result.body.lastName).to.not.equal(null);
      expect(result.body.birthdate).to.not.equal(null);
      expect(result.body.addressLine1).to.not.equal(null);
      expect(result.body.addressLine2).to.not.equal(null);
      expect(result.body.city).to.not.equal(null);
      expect(result.body.state).to.not.equal(null);
      expect(result.body.zipCode).to.not.equal(null);
      expect(result.body.roles).to.not.equal(null);
      expect(result.body.adminLoginOverride).to.not.equal(true);
    });

    it('should fail if either of the auth tokens are invalid', async () => {
      const user = await factory.create('user', {}, { hasSession: true });
      const result = await request(authService)
        .get('/services/v1/auth')
        .set('Authorization', user.id)
        .set('X-Device-Id', 'invalid');

      expect(result.status).to.equal(401);

      const result2 = await request(authService)
        .get('/services/v1/auth')
        .set('Authorization', 'invalid')
        .set('X-Device-Id', user.id);

      expect(result2.status).to.equal(401);
    });

    it('should be able to admin override with legacy auth', async () => {
      const userSession = await factory.create('user-session');
      const user = await User.findByPk(userSession.userId);
      await redis.setAsync([
        `adminLogin:${user.phoneNumber}`,
        JSON.stringify({ pin: '1111', password: 'DaveSaves1111!' }),
        'EX',
        '60',
      ]);
      await UserHelper.attemptToSetAdminLoginOverrideSession(
        userSession,
        user.phoneNumber,
        'DaveSaves1111!',
      );
      await userSession.reload();
      expect(userSession.adminLoginOverride).to.be.true;
      const result = await request(authService)
        .get('/services/v1/auth')
        .set('Authorization', userSession.token)
        .set('X-Device-Id', userSession.deviceId);
      expect(result.status).to.equal(200);
      expect(result.body.adminLoginOverride).to.be.true;
    });
  });

  describe('GET /auth with sombra token', () => {
    before(() => clean());
    beforeEach(() => {
      stubLoomisClient(sandbox);
      sandbox.stub(SombraConfig, 'stubResponse').returns('false');
      sandbox.stub(sombraClient, 'exchangeSession').resolves();
      sandbox.stub(SombraTokenValidator.prototype, 'isEnabled' as any).returns(true);
    });
    afterEach(() => clean(sandbox));

    it('should succeed with sombra token', async () => {
      const userSession = await factory.create('user-session');
      const token = generateToken(userSession.userId);
      const result = await request(authService)
        .get('/services/v1/auth')
        .set('X-Access-Token', token)
        .set('X-Device-Id', userSession.userId);
      expect(result.status).to.equal(200);
    });

    it('should not be able to admin override with a sombra token', async () => {
      const userSession = await factory.create('user-session');
      const user = await User.findByPk(userSession.userId);
      await redis.setAsync([
        `adminLogin:${user.phoneNumber}`,
        JSON.stringify({ pin: '1111', password: 'DaveSaves1111!' }),
        'EX',
        '60',
      ]);

      await UserHelper.attemptToSetAdminLoginOverrideSession(
        userSession,
        user.phoneNumber,
        'DaveSaves1111!',
      );

      await userSession.reload();
      expect(userSession.adminLoginOverride).to.be.true;

      const token = generateToken(userSession.userId);
      const result = await request(authService)
        .get('/services/v1/auth')
        .set('X-Access-Token', token)
        .set('X-Device-Id', userSession.userId);
      expect(result.status).to.equal(200);
      expect(result.body.adminLoginOverride).to.be.false;
    });
  });
});
