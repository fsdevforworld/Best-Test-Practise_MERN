import { DEFAULT_TIMEZONE, moment } from '@dave-inc/time-lib';
import * as ACH from '../../../src/domain/collection/ach';
import { expect } from 'chai';

describe('ACH', () => {
  describe('isInSameDayCollectionWindow', () => {
    const tests = [
      {
        period: 'Business day before 8:55 AM',
        time: (moment as any).tz('2018-03-19 07:00', DEFAULT_TIMEZONE),
        expected: true,
      },
      {
        period: 'Business day after 8:55 AM',
        time: (moment as any).tz('2018-03-27 08:56', DEFAULT_TIMEZONE),
        expected: false,
      },
      {
        period: 'Business day after 9 AM',
        time: (moment as any).tz('2018-03-27 09:01', DEFAULT_TIMEZONE),
        expected: false,
      },
      { period: 'Saturday', time: moment('2018-03-17'), expected: false },
      {
        period: 'Sunday',
        time: (moment as any).tz('2018-03-18', DEFAULT_TIMEZONE).endOf('day'),
        expected: false,
      },
      {
        period: 'Bank Holiday',
        time: (moment as any).tz('2018-07-04 06:00', DEFAULT_TIMEZONE),
        expected: false,
      },
    ];

    tests.forEach((test: any) => {
      it(test.period, () => {
        expect(ACH.isInSameDayACHCollectionWindow(test.time)).to.equal(test.expected);
      });
    });
  });

  describe('isInCollectionWindows', () => {
    const tests = [
      {
        period: 'Business day before 8:55 AM',
        time: (moment as any).tz('2018-03-19 07:00', DEFAULT_TIMEZONE),
        expectedSameDay: true,
        expectedNextDay: true,
      },
      {
        period: 'Business day after 8:55 AM but before 3:55 PM',
        time: (moment as any).tz('2018-03-27 12:56', DEFAULT_TIMEZONE),
        expectedSameDay: false,
        expectedNextDay: true,
      },
      {
        period: 'Business day after 4 PM',
        time: (moment as any).tz('2018-03-27 16:01', DEFAULT_TIMEZONE),
        expectedSameDay: false,
        expectedNextDay: false,
      },
      {
        period: 'Saturday',
        time: moment('2018-03-17'),
        expectedSameDay: false,
        expectedNextDay: false,
      },
      {
        period: 'Sunday',
        time: (moment as any).tz('2018-03-18', DEFAULT_TIMEZONE).endOf('day'),
        expectedSameDay: false,
        expectedNextDay: false,
      },
      {
        period: 'Bank Holiday',
        time: (moment as any).tz('2018-07-04 06:00', DEFAULT_TIMEZONE),
        expectedSameDay: false,
        expectedNextDay: false,
      },
    ];

    tests.forEach((test: any) => {
      it(test.period, () => {
        const {
          isInSameDayACHCollectionWindow,
          isInNextDayACHCollectionWindow,
        } = ACH.isInACHCollectionWindows(test.time);
        expect(isInSameDayACHCollectionWindow).to.equal(test.expectedSameDay);
        expect(isInNextDayACHCollectionWindow).to.equal(test.expectedNextDay);
      });
    });
  });

  describe('getNextACHCollectionTime', () => {
    const tests = [
      {
        description: 'Weekday',
        time: (moment as any).tz('2020-02-13 08:00', DEFAULT_TIMEZONE),
        result: (moment as any).tz('2020-02-14 00:00', DEFAULT_TIMEZONE),
      },
      {
        description: 'Friday',
        time: (moment as any).tz('2020-02-07 08:00', DEFAULT_TIMEZONE),
        result: (moment as any).tz('2020-02-10 00:00', DEFAULT_TIMEZONE),
      },
      {
        description: 'Friday before holiday',
        time: (moment as any).tz('2020-02-14 08:00', DEFAULT_TIMEZONE),
        result: (moment as any).tz('2020-02-18 00:00', DEFAULT_TIMEZONE),
      },
      {
        description: 'Saturday',
        time: (moment as any).tz('2020-02-08 08:00', DEFAULT_TIMEZONE),
        result: (moment as any).tz('2020-02-10 00:00', DEFAULT_TIMEZONE),
      },
      {
        description: 'Sunday',
        time: (moment as any).tz('2020-02-09 08:00', DEFAULT_TIMEZONE),
        result: (moment as any).tz('2020-02-10 00:00', DEFAULT_TIMEZONE),
      },
      {
        description: 'Leap Year',
        time: (moment as any).tz('2020-02-29 08:00', DEFAULT_TIMEZONE),
        result: (moment as any).tz('2020-03-02 00:00', DEFAULT_TIMEZONE),
      },
    ];

    tests.forEach((test: any) => {
      it(`Next ACH Time: ${test.description}`, () => {
        const nextTime = ACH.getNextACHCollectionTime(test.time);
        // tslint:disable-next-line: no-unused-expression
        expect(nextTime.isSame(test.result)).to.be.true;
      });
    });
  });
});
