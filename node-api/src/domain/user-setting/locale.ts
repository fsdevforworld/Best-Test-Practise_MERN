import { parse } from 'bcp-47';

import { SettingName, BCP47LanguageTag } from '../../typings';
import { dogstatsd } from '../../lib/datadog-statsd';
import { getValue, setValue, destroy } from './user-setting';

enum Metrics {
  UserChoseLocale = 'user_setting.locale_chosen',
  UserClearedLocale = 'user_setting.locale_removed',
}

export async function getUserLocale(userId: number) {
  return getValue(SettingName.Locale, userId);
}

export function getLanguage(locale: string) {
  const { language } = parse(locale);
  return language;
}

export async function setUserLocale(userId: number, locale: string, language: string) {
  const settingValue = await getUserLocale(userId);
  if (language !== BCP47LanguageTag.English) {
    await setValue(SettingName.Locale, userId, locale);
    dogstatsd.increment(Metrics.UserChoseLocale, { locale });
  } else if (settingValue) {
    /**
     * Do not persist Engish-language settings yet because that would immediately
     * add millions of rows to this table. We are still experimenting with the
     * exact schema we want and need the table to stay small for now. Once
     * the schema is stable, I will expand this feature in PLAT-1196.
     * When we remove this `if-else` condition, the metric below should
     * stop being incremented.
     */
    await destroy(SettingName.Locale, userId);
    dogstatsd.increment(Metrics.UserClearedLocale);
  }
}
