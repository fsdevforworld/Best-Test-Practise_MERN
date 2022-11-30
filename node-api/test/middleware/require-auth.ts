/* tslint:disable:no-require-imports */
import { Response } from 'express';
import * as Bluebird from 'bluebird';
import { expect } from 'chai';
import MockExpressRequest = require('mock-express-request');
import * as sinon from 'sinon';
import * as request from 'supertest';

import * as sombraClient from '../../src/services/sombra/client';
import requireAuth from '../../src/middleware/require-auth';
import { Cookie } from 'tough-cookie';

import {
  UserAppVersion,
  UserIpAddress,
  UserSession,
  UserSetting,
  UserSettingName,
} from '../../src/models';

import { IDaveRequest, SettingName } from '../../src/typings';

import app from '../../src/api';

import factory from '../factories';
import { clean, stubLoomisClient } from '../test-helpers';

import { generateToken, generateTokenWrongPrivKey } from '../test-helpers/sombra';

import * as RequestResponseHelpers from '../../src/api/v2/user/helpers';

describe('require-auth Middleware', () => {
  app.get('/test', requireAuth, function test(req: IDaveRequest, res: Response) {
    res.status(200);
    res.send();
    return;
  });

  app.get('/testWithCookies', requireAuth, function test(req: IDaveRequest, res: Response) {
    RequestResponseHelpers.setCookies(
      req,
      res,
      req.get('Authorization'),
      req.get('X-Device-Id'),
      req.get('X-Device-Type'),
    );
    res.status(200);
    res.send();
    return;
  });

  describe('with Cookie Authorization (Node-API Session only)', () => {
    const sandbox = sinon.createSandbox();

    before(() => clean());
    beforeEach(() => {
      stubLoomisClient(sandbox);
    });
    afterEach(() => clean(sandbox));

    it(`accepts a request with a valid Node-API sessions in the 'user' cookie`, async () => {
      const userSession = await factory.create('user-session');
      const createUserResult = await request(app)
        .get('/testWithCookies')
        .set('X-Device-Id', userSession.deviceId)
        .set('X-Device-Type', 'ios')
        .set('Authorization', userSession.token);

      // @ts-ignore
      const setCookies: string[] = createUserResult.get('set-cookie');
      const cookies = setCookies.map(each => Cookie.parse(each));
      const userCookie = cookies.filter(each => each.key === 'user');
      // We set two user cookies, one for dave.com and one for trydave.com
      expect(userCookie).to.be.length(2);

      const result = await request(app)
        .get('/test')
        .set('Cookie', [`${userCookie[1].cookieString()}`]);

      expect(result.status).to.equal(200);
    });
  });

  describe('always (Node-API Session & Sombra Access Tokens)', () => {
    const sandbox = sinon.createSandbox();

    before(() => clean());
    beforeEach(async () => {
      stubLoomisClient(sandbox);
      sandbox.stub(sombraClient, 'exchangeSession').resolves();
    });

    afterEach(() => clean(sandbox));

    app.get('/test', requireAuth, function test(req: IDaveRequest, res: Response) {
      res.status(200);
      res.send();
      return;
    });

    it('throws an error if the request contains neither a Sombra Access Token or Node-API Session', async () => {
      const result = await request(app).get('/test');

      expect(result.status).to.equal(400);
    });

    it('errors when a user is flagged for fraud', async () => {
      const user = await factory.create('user', { fraud: true });
      const session = await factory.create('user-session', { userId: user.id });
      const accessToken = generateToken(user.id);

      for (const authHeader of [
        {
          name: 'Node-API Session',
          key: 'Authorization',
          value: session.token,
        },
        { name: 'Sombra Access Token', key: 'X-Access-Token', value: accessToken },
      ]) {
        const req = new MockExpressRequest({
          headers: {
            'X-Device-Id': session.deviceId,
            [authHeader.key]: authHeader.value,
            'X-Device-Type': 'ios',
          },
        });

        return new Bluebird((resolve, reject) => {
          requireAuth(req as IDaveRequest, {} as Response, async (ex: any) => {
            try {
              expect(ex).to.exist;
              expect(ex.message).to.equal('PleaseContactCustomerService'); // value of error key BEFORE the error middleware translates it
            } catch (err) {
              reject(err);
            }

            resolve();
          });
        });
      }
    });

    it('allows a request with a valid session or access token', async () => {
      const user = await factory.create('user');
      const session = await factory.create('user-session', { userId: user.id });
      const accessToken = generateToken(user.id);

      for (const authHeader of [
        {
          name: 'Node-API Session',
          key: 'Authorization',
          value: session.token,
        },
        { name: 'Sombra Access Token', key: 'X-Access-Token', value: accessToken },
      ]) {
        const result = await request(app)
          .get('/test')
          .set(authHeader.key, authHeader.value)
          .set('X-Device-Id', session.deviceId);

        expect(result.status).to.equal(200);
      }
    });

    for (const authHeader of [
      {
        name: 'Node-API Session',
        key: 'Authorization',
      },
      { name: 'Sombra Access Token', key: 'X-Access-Token' },
    ]) {
      it(`denies a request with an invalid ${authHeader.name}`, async () => {
        const user = await factory.create('user');
        const session = await factory.create('user-session', { userId: user.id });
        const accessToken = generateToken(user.id);

        const value =
          authHeader.key === 'Authorization' ? `${session}+10000` : `${accessToken}+10000`;
        const result = await request(app)
          .get('/test')
          .set(authHeader.key, value)
          .set('X-Device-Id', session.deviceId);

        expect(result.status).to.equal(401);
      });
    }

    it('supports plain headers for locale', async () => {
      const user = await factory.create('user');
      const session = await factory.create('user-session', { userId: user.id });
      const accessToken = generateToken(user.id);

      for (const authHeader of [
        {
          name: 'Node-API Session',
          key: 'Authorization',
          value: session.token,
        },
        { name: 'Sombra Access Token', key: 'X-Access-Token', value: accessToken },
      ]) {
        const result = await request(app)
          .get('/test')
          .set(authHeader.key, authHeader.value)
          .set('X-Device-Id', session.deviceId)
          .set('Locale', 'es');

        expect(result.status).to.equal(200);
      }
    });

    it('adds a user_ip_address row with valid authorization', async () => {
      const user = await factory.create('user');
      const session = await factory.create('user-session', { userId: user.id });
      const accessToken = generateToken(user.id);

      const spy = sandbox.stub(UserIpAddress, 'upsert').resolves();

      for (const authHeader of [
        {
          name: 'Node-API Session',
          key: 'Authorization',
          value: session.token,
        },
        { name: 'Sombra Access Token', key: 'X-Access-Token', value: accessToken },
      ]) {
        const req = new MockExpressRequest({
          headers: {
            'X-Device-Id': session.deviceId,
            [authHeader.key]: authHeader.value,
            'X-Device-Type': 'ios',
          },
        });

        return new Promise((resolve, reject) => {
          requireAuth(req as IDaveRequest, {} as Response, async (ex: any) => {
            try {
              expect(ex).to.not.exist;
              expect(spy).to.have.callCount(1);
              const args = spy.getCall(0).args;
              expect(args.length).to.equal(1);
              expect(args[0].ipAddress).to.equal('localhost');
              expect(args[0].userId).to.equal(user.id);
            } catch (err) {
              reject(err);
            }

            resolve();
          });
        });
      }
    });

    it('should add user_app_version row with valid authorization', async () => {
      const user = await factory.create('user');
      const session = await factory.create('user-session', { userId: user.id });
      const accessToken = generateToken(user.id);

      for (const authHeader of [
        {
          name: 'Node-API Session',
          key: 'Authorization',
          value: session.token,
        },
        { name: 'Sombra Access Token', key: 'X-Access-Token', value: accessToken },
      ]) {
        const req = new MockExpressRequest({
          headers: {
            'X-Device-Id': session.deviceId,
            [authHeader.key]: authHeader.value,
            'X-Device-Type': 'ios',
            'X-App-Version': '2.2.3',
          },
        });
        const stub = sandbox.stub(UserAppVersion, 'upsert').resolves();
        return new Promise((resolve, reject) => {
          requireAuth(req as IDaveRequest, {} as Response, async (ex: any) => {
            try {
              const args = stub.getCall(0).args;
              expect(args.length).to.equal(1);
              expect(stub).to.have.callCount(1);
              expect(args[0].appVersion).to.equal('2.2.3');
              expect(args[0].deviceType).to.equal('ios');
              expect(args[0].userId).to.equal(user.id);
            } catch (err) {
              reject(err);
            }
            resolve();
          });
        });
      }
    });

    it('adds a locale user-setting for spanish-speaking users', async () => {
      const user = await factory.create('user');
      const userSession = await factory.create('user-session');
      const accessToken = generateToken(user.id);

      for (const authHeader of [
        {
          name: 'Node-API Session',
          key: 'Authorization',
          value: userSession.token,
        },
        { name: 'Sombra Access Token', key: 'X-Access-Token', value: accessToken },
      ]) {
        const result = await request(app)
          .get('/test')
          .set(authHeader.key, authHeader.value)
          .set('X-Device-Id', userSession.deviceId)
          .set('Locale', 'es-US');

        expect(result.status).to.equal(200);

        const localeSetting = await UserSetting.findOne({
          include: [
            { model: UserSettingName, required: true, where: { name: SettingName.Locale } },
          ],
          where: { userId: userSession.userId },
        });

        expect(localeSetting).to.exist;
        expect(localeSetting.value).to.equal('es-US');
      }
    });

    it('does not add a locale user-setting for english-speaking users', async () => {
      const userSession = await factory.create<UserSession>('user-session');
      const user = await userSession.getUser();
      const accessToken = generateToken(user.id);

      for (const authHeader of [
        {
          name: 'Node-API Session',
          key: 'Authorization',
          value: userSession.token,
        },
        { name: 'Sombra Access Token', key: 'X-Access-Token', value: accessToken },
      ]) {
        const result = await request(app)
          .get('/test')
          .set(authHeader.key, authHeader.value)
          .set('X-Device-Id', userSession.deviceId)
          .set('Locale', 'en');

        expect(result.status).to.equal(200);

        const localeSetting = await UserSetting.findOne({
          include: [
            { model: UserSettingName, required: true, where: { name: SettingName.Locale } },
          ],
          where: { userId: userSession.userId },
        });

        expect(localeSetting).to.not.exist;
      }
    });

    it('does not add a locale user-setting when the request does not specify any locale', async () => {
      const userSession = await factory.create<UserSession>('user-session');
      const user = await userSession.getUser();
      const accessToken = generateToken(user.id);

      for (const authHeader of [
        {
          name: 'Node-API Session',
          key: 'Authorization',
          value: userSession.token,
        },
        { name: 'Sombra Access Token', key: 'X-Access-Token', value: accessToken },
      ]) {
        const result = await request(app)
          .get('/test')
          .set(authHeader.key, authHeader.value)
          .set('X-Device-Id', userSession.deviceId);

        expect(result.status).to.equal(200);

        const localeSetting = await UserSetting.findOne({
          include: [
            { model: UserSettingName, required: true, where: { name: SettingName.Locale } },
          ],
          where: { userId: userSession.userId },
        });

        expect(localeSetting).to.not.exist;
      }
    });

    it('clears out locale settings if the user specifies something other than spanish', async () => {
      const userSession = await factory.create<UserSession>('user-session');
      const user = await userSession.getUser();
      const accessToken = generateToken(user.id);

      for (const authHeader of [
        {
          name: 'Node-API Session',
          key: 'Authorization',
          value: userSession.token,
        },
        { name: 'Sombra Access Token', key: 'X-Access-Token', value: accessToken },
      ]) {
        const resultOne = await request(app)
          .get('/test')
          .set(authHeader.key, authHeader.value)
          .set('X-Device-Id', userSession.deviceId)
          .set('Locale', 'es');

        expect(resultOne.status).to.equal(200);

        const localeSettingOne = await UserSetting.findOne({
          include: [
            { model: UserSettingName, required: true, where: { name: SettingName.Locale } },
          ],
          where: { userId: userSession.userId },
        });

        expect(localeSettingOne).to.exist;
        expect(localeSettingOne.value).to.equal('es');

        const resultTwo = await request(app)
          .get('/test')
          .set(authHeader.key, authHeader.value)
          .set('X-Device-Id', userSession.deviceId)
          .set('Locale', 'en-US');

        expect(resultTwo.status).to.equal(200);

        const localeSettingTwo = await UserSetting.findOne({
          include: [
            { model: UserSettingName, required: true, where: { name: SettingName.Locale } },
          ],
          where: { userId: userSession.userId },
        });

        expect(localeSettingTwo).to.not.exist;
      }
    });

    it('does not confuse spanish with similar locale strings', async () => {
      const userSession = await factory.create<UserSession>('user-session');
      const user = await userSession.getUser();
      const accessToken = generateToken(user.id);

      for (const authHeader of [
        {
          name: 'Node-API Session',
          key: 'Authorization',
          value: userSession.token,
        },
        { name: 'Sombra Access Token', key: 'X-Access-Token', value: accessToken },
      ]) {
        const result = await request(app)
          .get('/test')
          .set(authHeader.key, authHeader.value)
          .set('X-Device-Id', userSession.deviceId)
          .set('Locale', 'est-EE');

        expect(result.status).to.equal(200);

        const localeSetting = await UserSetting.findOne({
          include: [
            { model: UserSettingName, required: true, where: { name: SettingName.Locale } },
          ],
          where: { userId: userSession.userId },
        });

        expect(localeSetting.value).to.equal('est-EE');
      }
    });
  });

  describe('when the request is missing the x-device-id header', () => {
    it('rejects a request using valid Node-API sessions', async () => {
      const userSession = await factory.create('user-session');
      const result = await request(app)
        .get('/test')
        .set('Authorization', userSession.token);

      expect(result.status).to.equal(400);
    });

    it('allows a request for valid Sombra Access Tokens', async () => {
      const user = await factory.create('user');
      const token = generateToken(user.id);
      const result = await request(app)
        .get('/test')
        .set('X-Access-Token', token);

      expect(result.status).to.equal(200);
    });
  });

  describe('Sombra Authorization specifically', () => {
    it('rejects a Sombra Access Token signed an incorrect private key', async () => {
      const user = await factory.create('user');
      const token = generateTokenWrongPrivKey(user.id);
      const result = await request(app)
        .get('/v2/user')
        .set('X-Access-Token', token)
        .set('X-Device-Id', 'blah');
      expect(result.status).to.equal(401);
    });

    it('rejects an expired Sombra Access Token', async () => {
      const user = await factory.create('user');
      const token = generateToken(user.id, -1);
      const result = await request(app)
        .get('/v2/user')
        .set('X-Access-Token', token)
        .set('X-Device-Id', 'blah');
      expect(result.status).to.equal(401);
    });

    it('rejects an invalid Sombra Access Token even if also has valid legacy auth in header', async () => {
      const userSession = await factory.create('user-session');
      const token = generateToken(userSession.userId, -1);
      const result = await request(app)
        .get('/v2/user')
        .set('Authorization', userSession.token)
        .set('X-Access-Token', token)
        .set('X-Device-Id', userSession.deviceId);
      expect(result.status).to.equal(401);
    });
  });
});
