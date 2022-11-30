import { dogstatsd } from '../../lib/datadog-statsd';
import logger from '../../lib/logger';
import { UserSetting } from '../../models';
import { SettingId, SettingName } from '../../typings';
import { Cache } from '../../lib/cache';

enum Metrics {
  CreateSuccess = 'user_setting.create.success',
  CreateError = 'user_setting.create.error',
  GetCached = 'user_setting.get.cached',
  GetDatabase = 'user_setting.get.database',
  NotFound = 'user_setting.get.notfound',
}

export const CACHE_PREFIX = 'user-setting';
const cache = new Cache(CACHE_PREFIX);

export function getKey(name: SettingName, userId: number) {
  return `${name}:${userId}`;
}

export async function getValue(name: SettingName, userId: number): Promise<string | undefined> {
  const key = getKey(name, userId);
  const cachedValue = await cache.get(key);
  if (cachedValue) {
    dogstatsd.increment(Metrics.GetCached, { name });
    return cachedValue;
  }

  // @ts-ignore
  const userSettingNameId = SettingId[name];
  const setting = await UserSetting.findOne({ where: { userId, userSettingNameId } });
  if (setting) {
    dogstatsd.increment(Metrics.GetDatabase, { name });
    await setCache(name, userId, setting.value);
    return setting.value;
  }

  dogstatsd.increment(Metrics.NotFound, { name });

  return;
}

export async function setValue(name: SettingName, userId: number, value: string): Promise<void> {
  const setting = await getValue(name, userId);
  // @ts-ignore
  const userSettingNameId = SettingId[name];
  if (setting && setting !== value) {
    await UserSetting.update({ value }, { where: { userId, userSettingNameId } });
    await setCache(name, userId, value);
  } else if (!setting) {
    try {
      await UserSetting.findOrCreate({ where: { value, userId, userSettingNameId } });
      await setCache(name, userId, value);
      dogstatsd.increment(Metrics.CreateSuccess, { name });
    } catch (error) {
      logger.error(`Error creating user_setting: ${name}`, { error });
      dogstatsd.increment(Metrics.CreateError, { name });
    }
  }
}

export async function destroy(name: SettingName, userId: number) {
  // @ts-ignore
  const userSettingNameId = SettingId[name];
  await UserSetting.destroy({ where: { userId, userSettingNameId } });
  await clearCache(SettingName.Locale, userId);
}

export async function setCache(
  name: SettingName,
  userId: number,
  value: string,
  ttl: number = 86400 /* 1 day */,
) {
  const key = getKey(name, userId);
  return cache.set(key, value, ttl);
}

export async function clearCache(name: SettingName, userId: number) {
  return cache.remove(getKey(name, userId));
}
