import { Moment, moment } from '@dave-inc/time-lib';
import { SettingName } from '../../typings';

import { getValue, setValue } from './user-setting';

export async function getTimezone(userId: number) {
  return getValue(SettingName.Timezone, userId);
}

export async function getLocalTime(userId: number) {
  const timezone = await getTimezone(userId);
  if (timezone) {
    return moment.tz(timezone) as Moment;
  }
  return moment();
}

export async function setUserTimezone(userId: number, timezone: string) {
  await setValue(SettingName.Timezone, userId, timezone);
}
