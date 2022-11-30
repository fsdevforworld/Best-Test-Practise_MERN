import { expect } from 'chai';
import * as sinon from 'sinon';
import factory from '../../factories';

import { clean } from '../../test-helpers';
import * as UserSetting from '../../../src/domain/user-setting/locale';
import { UserSetting as Model } from '../../../src/models';
import { SettingId } from '../../../src/typings';

describe('User setting domain - locale', () => {
  const sandbox = sinon.createSandbox();
  before(() => clean());
  afterEach(() => clean(sandbox));

  describe('getTimezone', () => {
    it('should be empty if not set', async () => {
      const user = await factory.create('user');
      const userId = user.id;
      const result = await UserSetting.getUserLocale(userId);
      expect(result).to.equal(undefined);
    });

    it('should get locale for user', async () => {
      const user = await factory.create('user');
      const userId = user.id;
      const userSettingNameId = SettingId.locale;
      const value = 'en-US';

      await factory.create('user-setting', {
        userSettingNameId,
        userId,
        value,
      });

      const result = await UserSetting.getUserLocale(userId);
      expect(result).to.equal(value);
    });
  });

  describe('getLanguage', () => {
    it('should get language value', async () => {
      const result = UserSetting.getLanguage('en-US');
      expect(result).to.equal('en');
    });
  });

  describe('setUserLocale', () => {
    it('should not set locale for english', async () => {
      const user = await factory.create('user');
      const userId = user.id;
      const userSettingNameId = SettingId.locale;
      const locale = 'en-US';
      const language = 'en';

      await UserSetting.setUserLocale(userId, locale, language);

      const setting = await Model.findOne({ where: { userSettingNameId, userId } });
      expect(setting).to.be.null;
    });

    it('should set locale for spanish', async () => {
      const user = await factory.create('user');
      const userId = user.id;
      const userSettingNameId = SettingId.locale;
      const locale = 'es-US';
      const language = 'es';

      await UserSetting.setUserLocale(userId, locale, language);

      const setting = await Model.findOne({ where: { userSettingNameId, userId } });
      expect(setting.value).to.equal('es-US');
    });

    it('should remove user locale if new value is english', async () => {
      const user = await factory.create('user');
      const userId = user.id;
      const userSettingNameId = SettingId.locale;

      await UserSetting.setUserLocale(userId, 'es-US', 'es');
      const setting = await Model.findOne({ where: { userSettingNameId, userId } });
      expect(setting.value).to.equal('es-US');

      await UserSetting.setUserLocale(userId, 'en-US', 'en');
      const updatedSetting = await Model.findOne({ where: { userSettingNameId, userId } });
      expect(updatedSetting).to.be.null;
    });
  });
});
