import { expect } from 'chai';
import * as sinon from 'sinon';
import factory from '../../factories';
import redisClient from '../../../src/lib/redis';

import { clean } from '../../test-helpers';
import * as UserSetting from '../../../src/domain/user-setting/user-setting';
import { UserSetting as Model } from '../../../src/models';
import { SettingName, SettingId } from '../../../src/typings';

describe('User setting domain', () => {
  const sandbox = sinon.createSandbox();
  before(() => clean());
  afterEach(() => clean(sandbox));

  describe('getValue', () => {
    it('should return empty if no value saved', async () => {
      const user = await factory.create('user');
      const userId = user.id;
      const result = await UserSetting.getValue(SettingName.Locale, userId);
      expect(result).to.equal(undefined);
    });

    it('should get cached value', async () => {
      const value = 'en_US';
      const user = await factory.create('user');
      const userId = user.id;

      const suffix = UserSetting.getKey(SettingName.Locale, userId);
      const key = getRedisKey(suffix);
      await redisClient.setAsync(key, value);

      const cached = await UserSetting.getValue(SettingName.Locale, userId);
      expect(cached).to.equal(value);
    });

    it('should fallback to database if no cached value', async () => {
      const value = 'en_US';
      const user = await factory.create('user');
      const userId = user.id;
      const userSettingNameId = SettingId.locale;

      await factory.create('user-setting', {
        userSettingNameId,
        userId,
        value,
      });

      const suffix = UserSetting.getKey(SettingName.Locale, userId);
      const key = getRedisKey(suffix);
      const cached = await redisClient.getAsync(key);
      expect(cached, 'not cached before fetching').to.equal(null);

      const result = await UserSetting.getValue(SettingName.Locale, userId);
      expect(result, 'fetched from database').to.equal(value);

      const updatedCached = await redisClient.getAsync(key);
      expect(updatedCached, 'cached after fetching first time').to.equal(value);
    });
  });

  describe('setValue', () => {
    it('should add a key to redis', async () => {
      const value = 'en_US';
      const user = await factory.create('user');
      const userId = user.id;

      await UserSetting.setValue(SettingName.Locale, userId, value);

      const suffix = UserSetting.getKey(SettingName.Locale, userId);
      const key = getRedisKey(suffix);

      const savedItem = await redisClient.getAsync(key);
      expect(savedItem).to.equal(value);

      const ttl = await redisClient.ttlAsync(key);
      expect(ttl > 0).to.equal(true);
    });

    it('should update redis value if already set', async () => {
      const value = 'en_US';
      const user = await factory.create('user');
      const userId = user.id;
      const suffix = UserSetting.getKey(SettingName.Locale, userId);
      const key = getRedisKey(suffix);

      await UserSetting.setValue(SettingName.Locale, userId, value);
      const item = await redisClient.getAsync(key);
      expect(item).to.equal(value);

      const updatedValue = 'es_US';
      await UserSetting.setValue(SettingName.Locale, userId, updatedValue);
      const updatedItem = await redisClient.getAsync(key);
      expect(updatedItem).to.equal(updatedValue);
    });

    it('should set value in database', async () => {
      const value = 'en_US';
      const user = await factory.create('user');
      const userId = user.id;
      const userSettingNameId = SettingId.locale;

      await UserSetting.setValue(SettingName.Locale, userId, value);

      const setting = await Model.findOne({ where: { userSettingNameId, userId } });
      expect(setting.value).to.equal(value);
    });

    it('should update database value if already set', async () => {
      const value = 'en_US';
      const user = await factory.create('user');
      const userId = user.id;
      const userSettingNameId = SettingId.locale;

      await UserSetting.setValue(SettingName.Locale, userId, value);
      const setting = await Model.findOne({ where: { userSettingNameId, userId } });
      expect(setting.value).to.equal(value);

      const updatedValue = 'es_US';
      await UserSetting.setValue(SettingName.Locale, userId, updatedValue);
      await setting.reload();
      expect(setting.value).to.equal(updatedValue);
    });
  });

  describe('destroy', () => {
    it('should remove redis value', async () => {
      const value = 'en_US';
      const user = await factory.create('user');
      const userId = user.id;
      const suffix = UserSetting.getKey(SettingName.Locale, userId);
      const key = getRedisKey(suffix);

      await UserSetting.setValue(SettingName.Locale, userId, value);
      const item = await redisClient.getAsync(key);
      expect(item).to.equal(value);

      await UserSetting.destroy(SettingName.Locale, userId);
      const updatedItem = await redisClient.getAsync(key);
      expect(updatedItem).to.equal(null);
    });

    it('should remove database value', async () => {
      const value = 'en_US';
      const user = await factory.create('user');
      const userId = user.id;
      const userSettingNameId = SettingId.locale;

      await UserSetting.setValue(SettingName.Locale, userId, value);
      const setting = await Model.findOne({ where: { userSettingNameId, userId } });
      expect(setting.value).to.equal(value);

      await UserSetting.destroy(SettingName.Locale, userId);
      const settingAfterDestroy = await Model.findOne({ where: { userSettingNameId, userId } });
      expect(settingAfterDestroy).to.equal(null);
    });
  });
});

function getRedisKey(part: string) {
  return `${UserSetting.CACHE_PREFIX}${part}`;
}
