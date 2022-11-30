import * as request from 'supertest';
import app from '../../../../src/services/internal-dashboard-api';
import { moment } from '@dave-inc/time-lib';
import { expect } from 'chai';
import { clean, withInternalUser } from '../../../test-helpers';
import factory from '../../../factories';

describe('user_app_version endpoints', () => {
  before(() => clean());

  afterEach(() => clean());

  describe('SELECT ALL /dashboard/user/:userId/user_app_version', () => {
    it('gets all app versions and device types for a user', async () => {
      const userAppVersion = await factory.create('user-app-version', {
        appVersion: '2.5.11',
        deviceType: 'ios',
        firstSeen: moment(),
        lastSeen: moment(),
      });

      await factory.create('user-app-version', {
        userId: userAppVersion.userId,
        appVersion: '2.5.11',
        deviceType: 'android',
        firstSeen: moment().subtract(1, 'month'),
        lastSeen: moment().subtract(1, 'month'),
      });

      const url = `/dashboard/user/${userAppVersion.userId}/user_app_version`;

      const req = request(app).get(url);

      const result = await withInternalUser(req);

      expect(result.status).to.equal(200);
      expect(result.body).to.be.an('array');
      expect(result.body.length).to.equal(3);
      expect(result.body[0].deviceType).to.equal(userAppVersion.deviceType);
      expect(result.body[0].userId).to.equal(userAppVersion.userId);
    });
  });
});
