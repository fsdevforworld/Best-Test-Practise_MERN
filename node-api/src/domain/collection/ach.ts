import { Moment } from 'moment';
import { DEFAULT_TIMEZONE, moment } from '@dave-inc/time-lib';
import { isBankingDay, nextBankingDay } from '../../lib/banking-days';

const MAX_HOUR_SAME_DAY = 8;
const MAX_HOUR_NEXT_DAY = 15;
const MAX_MINUTES_EITHER_DAY = 55;

export const isWithinTimeWindow = (time: Moment, maxHour: number, maxMinutes: number) => {
  // [maxHour] or later
  if (time.hour() > maxHour) {
    return false;
  }

  // After [maxHour]:[maxMinutes]
  if (time.hour() === maxHour && time.minute() > maxMinutes) {
    return false;
  }

  return true;
};

export function isInSameDayACHCollectionWindow(time: Moment = moment()): boolean {
  return isInACHCollectionWindows(time).isInSameDayACHCollectionWindow;
}

export function isInACHCollectionWindows(
  time: Moment = moment(),
): { isInNextDayACHCollectionWindow: boolean; isInSameDayACHCollectionWindow: boolean } {
  let isInNextDayACHCollectionWindow = false;
  let isInSameDayACHCollectionWindowBool = false;

  const westCoastTime = moment(time).tz(DEFAULT_TIMEZONE);

  if (isBankingDay(westCoastTime)) {
    isInNextDayACHCollectionWindow = isWithinTimeWindow(
      westCoastTime,
      MAX_HOUR_NEXT_DAY,
      MAX_MINUTES_EITHER_DAY,
    );
    isInSameDayACHCollectionWindowBool = isWithinTimeWindow(
      westCoastTime,
      MAX_HOUR_SAME_DAY,
      MAX_MINUTES_EITHER_DAY,
    );
  }

  return {
    isInNextDayACHCollectionWindow,
    isInSameDayACHCollectionWindow: isInSameDayACHCollectionWindowBool,
  };
}

export function getNextACHCollectionTime(time: Moment = moment().tz(DEFAULT_TIMEZONE)): Moment {
  return nextBankingDay(time.clone().add(1, 'days'), 1)
    .hour(0)
    .minute(0)
    .second(0);
}
