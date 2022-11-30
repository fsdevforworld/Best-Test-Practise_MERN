import { Moment } from 'moment';
import { moment, PACIFIC_TIMEZONE } from '@dave-inc/time-lib';
import * as Holidays from '@18f/us-federal-holidays';
import { isString } from 'lodash';
import { RollDirection } from '@dave-inc/wire-typings';

const HolidayMomentCache: Record<string, string[]> = {};

/*
 * Federal holidays that fall on a Saturday are observed
 * the prior Friday, but are NOT bank holidays per the
 * US Federal Reserve
 * https://www.federalreserve.gov/aboutthefed/k8.htm
 */
const RolledForwardHolidays = new Set(['2020-07-03', '2021-12-25', '2022-01-01', '2023-11-11']);

function isRolledForwardHoliday(dateStr: string): boolean {
  return RolledForwardHolidays.has(dateStr);
}

function generateYearHolidays(year: number): string[] {
  const yearHolidays = Holidays.allForYear(year);
  const holidays = yearHolidays
    .map(hol => moment(hol.dateString, 'YYYY-M-D').format('YYYY-MM-DD'))
    .filter(hol => !isRolledForwardHoliday(hol));
  return holidays;
}

export function isBankHoliday(date: Moment | string) {
  let dateString: string;
  let year: number;
  if (isString(date) && (date as string).match(/^\d{4}-\d{2}-\d{2}$/)) {
    dateString = date as string;
    year = parseInt(dateString.split('-')[0], 10);
  } else {
    const momentDate = moment(date);
    year = momentDate.year();
    dateString = momentDate.format('YYYY-MM-DD');
  }

  let holidays: string[] = HolidayMomentCache[year];
  if (!holidays) {
    holidays = generateYearHolidays(year);
    HolidayMomentCache[year] = holidays;
  }

  return holidays.includes(dateString);
}

/**
 * Get the next banking day. If direction is positive the function will roll forward the same number of
 * days as the direction. EX. if direction is 2 and 2018-01-02 is a saturday this will roll to 2018-01-04
 * if direction is 1 it will roll to 2018-01-03. If direction is -1 it will roll backward to friday.
 * @param {moment.Moment} givenDate
 * @param {RollDirection} direction
 * @returns {moment.Moment}
 */
export function nextBankingDay(givenDate: Moment, direction: RollDirection): Moment {
  givenDate = givenDate.clone();
  if (isBankingDay(givenDate)) {
    return givenDate;
  }
  const date = moment(givenDate);
  let days = Math.abs(direction);
  while (days > 0) {
    if (direction > 0) {
      date.add(1, 'days');
    } else {
      date.subtract(1, 'days');
    }
    if (isBankingDay(date)) {
      days -= 1;
    }
  }
  return date;
}

export function isBankingDay(date: Moment): boolean {
  const isWeekend = date.isoWeekday() >= 6;
  return !isWeekend && !isBankHoliday(date);
}

// Calculated in Pacific Time
export function addBankingDaysForAch(startDateTime: Moment, numBankingDays: number = 3): Moment {
  function recurse(date: Moment, days: number): Moment {
    if (days === 0) {
      return date;
    } else {
      const nextDate = moment(date).add(1, 'days');
      const canProcessOnThisDay = isBankingDay(nextDate);
      return canProcessOnThisDay ? recurse(nextDate, days - 1) : recurse(nextDate, days);
    }
  }

  if (!startDateTime || !startDateTime.isValid()) {
    throw new Error('Starting date is invalid');
  }
  const dateInPt = moment(startDateTime).tz(PACIFIC_TIMEZONE);
  const startDate = findEligibleStartDate(dateInPt);

  return recurse(startDate, numBankingDays);
}

const SYNAPSEPAY_CUT_OFF_TIME = 15; // Synapse cutoff time 3 PM Pacific Time

function findEligibleStartDate(dateTimeInPacificTime: Moment): Moment {
  const isBeforeCutOffTime = dateTimeInPacificTime.hour() < SYNAPSEPAY_CUT_OFF_TIME;
  if (isBankingDay(dateTimeInPacificTime) && isBeforeCutOffTime) {
    return dateTimeInPacificTime;
  } else {
    // only changes date, not time
    return nextBankingDay(dateTimeInPacificTime.add(1, 'day'), 1);
  }
}
