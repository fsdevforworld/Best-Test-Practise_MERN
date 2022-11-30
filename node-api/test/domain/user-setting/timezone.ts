import { expect } from 'chai';
import * as sinon from 'sinon';
import factory from '../../factories';

import { clean, fakeDateTime } from '../../test-helpers';
import * as UserSetting from '../../../src/domain/user-setting/timezone';
import { UserSetting as Model } from '../../../src/models';
import { SettingId } from '../../../src/typings';
import { moment } from '@dave-inc/time-lib';

describe('User setting domain - timezone', () => {
  const sandbox = sinon.createSandbox();
  before(() => clean());
  afterEach(() => clean(sandbox));

  describe('getTimezone', () => {
    it('should be empty if not set', async () => {
      const user = await factory.create('user');
      const userId = user.id;
      const result = await UserSetting.getTimezone(userId);
      expect(result).to.equal(undefined);
    });

    it('should get timezone for user', async () => {
      const user = await factory.create('user');
      const userId = user.id;
      const userSettingNameId = SettingId.timezone;
      const value = 'America/Los_Angeles';

      await factory.create('user-setting', {
        userSettingNameId,
        userId,
        value,
      });

      const result = await UserSetting.getTimezone(userId);
      expect(result).to.equal(value);
    });
  });

  describe('getLocalTime', () => {
    it('should get unaltered time if no user setting', async () => {
      const time = moment('2020-05-01 12', 'YYYY-MM-DD HH');
      fakeDateTime(sandbox, time);

      const user = await factory.create('user');
      const userId = user.id;
      const result = await UserSetting.getLocalTime(userId);
      expect(result.toString()).to.equal('Fri May 01 2020 12:00:00 GMT+0000');
    });
    it('should get time according to user', async () => {
      const time = moment('2020-05-01 12', 'YYYY-MM-DD HH');
      fakeDateTime(sandbox, time);

      const user = await factory.create('user');
      const userId = user.id;
      const userSettingNameId = SettingId.timezone;
      const value = 'America/Los_Angeles';
      await factory.create('user-setting', {
        userSettingNameId,
        userId,
        value,
      });

      const result = await UserSetting.getLocalTime(userId);
      expect(result.toString()).to.equal('Fri May 01 2020 05:00:00 GMT-0700');
    });

    it('should get time according to user', async () => {
      const time = moment('2020-05-01 12', 'YYYY-MM-DD HH');
      fakeDateTime(sandbox, time);

      const user = await factory.create('user');
      const userId = user.id;
      const userSettingNameId = SettingId.timezone;
      const value = 'America/Los_Angeles';
      await factory.create('user-setting', {
        userSettingNameId,
        userId,
        value,
      });

      const result = await UserSetting.getLocalTime(userId);
      expect(result.toString()).to.equal('Fri May 01 2020 05:00:00 GMT-0700');
    });
  });

  describe('setLocalTime', () => {
    it('should get unaltered time if no user setting', async () => {
      const user = await factory.create('user');
      const userId = user.id;
      const userSettingNameId = SettingId.timezone;
      await UserSetting.setUserTimezone(userId, 'Test');
      const setting = await Model.findOne({ where: { userId, userSettingNameId } });
      expect(setting.value).to.equal('Test');
    });
  });
});
