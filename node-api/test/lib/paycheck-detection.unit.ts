import * as PaycheckDetection from '../../src/domain/recurring-transaction/detect-recurring-schedule';
import 'mocha';
import { expect } from 'chai';
import { DateOnly, moment } from '@dave-inc/time-lib';
import { MatchResult } from '../../src/typings';
import { isEqual } from 'lodash';
import { RSched } from '../../src/lib/recurring-schedule';
import { RecurringTransactionInterval } from '@dave-inc/wire-typings';
import { ROLL_DIRECTIONS } from '../../src/domain/recurring-transaction/constants';

describe('paycheck detection', () => {
  describe('getBestPossibleSchedules', () => {
    it('should match a semi monthly schedule', async () => {
      const dates = [
        moment('2017-12-20'),
        moment('2018-01-05'),
        moment('2017-11-06'),
        moment('2017-11-21'),
        moment('2017-09-20'),
        moment('2017-07-20'),
        moment('2017-10-05'),
        moment('2017-07-05'),
        moment('2017-08-04'),
        moment('2017-10-20'),
        moment('2017-08-21'),
        moment('2017-09-05'),
        moment('2017-12-05'),
        moment('2018-01-19'),
        moment('2018-02-05'),
        moment('2018-02-20'),
        moment('2018-03-05'),
        moment('2018-03-20'),
        moment('2018-04-05'),
        moment('2018-04-20'),
        moment('2018-05-04'),
      ];
      const match = await PaycheckDetection.getBestScheduleMatch(dates, {
        today: DateOnly.fromString('2018-05-10'),
      });
      expect(match.params).to.deep.equal([5, 20]);
      expect(match.interval).to.equal(RecurringTransactionInterval.SEMI_MONTHLY);
      expect(match.rollDirection).to.equal(-1);
      expect(match.confidence).to.equal(92);
    });

    it('should match weekly with extra', async () => {
      const dates = [
        moment('2017-12-29'),
        moment('2018-01-05'),
        moment('2018-01-11'),
        moment('2018-01-18'),
        moment('2018-01-26'),
        moment('2018-02-01'),
        moment('2018-02-09'),
        moment('2018-02-15'),
        moment('2018-02-22'),
        moment('2018-03-01'),
        moment('2018-03-08'),
        moment('2018-03-15'),
        moment('2018-03-21'),
        moment('2018-03-27'),
        moment('2018-03-28'),
        moment('2018-03-29'),
        moment('2018-04-04'),
        moment('2018-04-09'),
        moment('2018-04-11'),
        moment('2018-04-18'),
        moment('2018-04-23'),
        moment('2018-04-27'),
        moment('2018-05-04'),
        moment('2018-05-08'),
        moment('2018-05-08'),
      ];
      const match = await PaycheckDetection.getBestScheduleMatch(dates, {
        today: DateOnly.fromString('2018-05-10'),
      });
      expect(match.params).to.deep.equal(['thursday']);
      expect(match.interval).to.equal(RecurringTransactionInterval.WEEKLY);
      expect(match.rollDirection).to.equal(-1);
      expect(match.confidence).to.equal(85);
    });

    it('should prefer biweekly', async () => {
      const dates = [
        '2018-07-12T00:00:00.000Z',
        '2018-07-12T00:00:00.000Z',
        '2018-07-26T00:00:00.000Z',
        '2018-07-26T00:00:00.000Z',
      ].map((x: any) => moment(x));
      const match = await PaycheckDetection.getBestScheduleMatch(dates, {
        today: DateOnly.fromString('2018-07-30'),
      });
      expect(match.params).to.deep.equal(['thursday']);
      expect(match.interval).to.equal(RecurringTransactionInterval.BIWEEKLY);
      expect(match.rollDirection).to.equal(-1);
      expect(match.confidence).to.equal(100);
    });

    it('should match semi monthly with extra observed', async () => {
      const dates = [
        moment('2017-09-15'),
        moment('2017-09-25'),
        moment('2017-10-10'),
        moment('2017-10-13'),
        moment('2017-10-13'),
        moment('2017-10-25'),
        moment('2017-11-10'),
        moment('2017-11-15'),
        moment('2017-11-15'),
        moment('2017-11-24'),
        moment('2017-12-08'),
        moment('2017-12-15'),
        moment('2017-12-15'),
        moment('2017-12-22'),
        moment('2018-01-02'),
        moment('2018-01-10'),
        moment('2018-01-12'),
        moment('2018-01-12'),
        moment('2018-01-25'),
        moment('2018-02-09'),
        moment('2018-02-15'),
        moment('2018-02-23'),
        moment('2018-03-09'),
        moment('2018-03-15'),
        moment('2018-03-23'),
        moment('2018-04-02'),
        moment('2018-04-10'),
        moment('2018-04-13'),
        moment('2018-04-25'),
        moment('2018-05-10'),
        moment('2018-05-15'),
      ];
      const match = await PaycheckDetection.getBestScheduleMatch(dates, {
        today: DateOnly.fromString('2018-05-20'),
      });
      expect(isEqual(match.params, [15, 25]) || isEqual(match.params, [10, 25])).to.be.true;
      expect(match.interval).to.equal(RecurringTransactionInterval.SEMI_MONTHLY);
      expect(match.rollDirection).to.equal(-1);
      expect(match.confidence).to.be.greaterThan(97);
    });

    it('should match semi monthly', async () => {
      const dates = [
        moment('2016-12-15'),
        moment('2016-12-30'),
        moment('2017-01-13'),
        moment('2017-01-31'),
        moment('2017-02-15'),
        moment('2017-02-28'),
        moment('2017-03-15'),
        moment('2017-03-30'),
        moment('2017-04-14'),
        moment('2017-04-20'),
        moment('2017-04-28'),
        moment('2017-05-15'),
        moment('2017-05-19'),
        moment('2017-05-31'),
        moment('2017-06-15'),
        moment('2017-06-15'),
        moment('2017-06-30'),
        moment('2017-07-14'),
        moment('2017-07-20'),
        moment('2017-07-28'),
        moment('2017-08-15'),
        moment('2017-08-21'),
        moment('2017-08-30'),
        moment('2017-09-15'),
        moment('2017-09-20'),
        moment('2017-09-29'),
        moment('2017-10-13'),
        moment('2017-10-30'),
        moment('2017-11-15'),
        moment('2017-11-30'),
        moment('2017-12-15'),
        moment('2017-12-29'),
        moment('2018-01-12'),
        moment('2018-01-30'),
        moment('2018-02-15'),
        moment('2018-02-28'),
        moment('2018-03-15'),
        moment('2018-03-30'),
        moment('2018-04-13'),
        moment('2018-04-30'),
      ];
      const match = await PaycheckDetection.getBestScheduleMatch(dates, {
        today: DateOnly.fromString('2018-05-04'),
      });
      expect(match.params).to.deep.equal([15, -1]);
      expect(match.interval).to.equal(RecurringTransactionInterval.SEMI_MONTHLY);
      expect(match.rollDirection).to.equal(-1);
    });

    it('should match semi_monthly dates', async () => {
      const dates = [
        '2017-10-30',
        '2017-11-14',
        '2017-11-29',
        '2017-12-14',
        '2017-12-28',
        '2018-01-11',
        '2018-01-11',
        '2018-01-30',
        '2018-02-14',
        '2018-02-27',
        '2018-03-14',
        '2018-03-29',
        '2018-04-12',
        '2018-04-27',
        '2018-05-14',
      ].map(x => moment(x));
      const match = await PaycheckDetection.getBestScheduleMatch(dates, {
        today: DateOnly.fromString('2018-05-20'),
      });
      expect(match.params).to.deep.equal([14, -1]);
      expect(match.interval).to.equal(RecurringTransactionInterval.SEMI_MONTHLY);
      expect(match.rollDirection).to.equal(-2);
      expect(match.confidence).to.equal(88);
    });

    it('should match weekday monthly schedule change', async () => {
      const dates = [
        '2018-05-01',
        '2018-04-03',
        '2018-03-06',
        '2018-02-06',
        '2018-01-09',
        '2017-12-12',
        '2017-11-14',
        '2017-10-31',
      ].map(x => moment(x));
      const match = await PaycheckDetection.getBestScheduleMatch(dates, {
        today: DateOnly.fromString('2018-05-10'),
      });
      expect(match.params).to.deep.equal([1, 'tuesday']);
      expect(match.interval).to.equal(RecurringTransactionInterval.WEEKDAY_MONTHLY);
      expect(match.rollDirection).to.equal(-1);
      expect(match.confidence).to.equal(100);
    });

    it('semi monthly strange', async () => {
      const dates = ['2018-05-08', '2018-04-20', '2018-04-06', '2018-03-22'].map(x => moment(x));
      const match = await PaycheckDetection.getBestScheduleMatch(dates, {
        today: DateOnly.fromString('2018-05-15'),
      });
      expect(match.params).to.deep.equal([8, 22]);
      expect(match.interval).to.equal(RecurringTransactionInterval.SEMI_MONTHLY);
      expect(match.rollDirection).to.equal(-1);
      expect(match.confidence).to.equal(100);
    });

    it('should match biweekly', async () => {
      const dates = ['2018-04-19', '2018-05-03', '2018-05-16'].map(x => moment(x));
      const match = await PaycheckDetection.getBestScheduleMatch(dates, {
        today: DateOnly.fromString('2018-05-30'),
      });
      expect(match.params).to.deep.equal(['thursday']);
      expect(match.interval).to.equal(RecurringTransactionInterval.BIWEEKLY);
      expect(match.rollDirection).to.equal(-1);
      expect(match.confidence).to.equal(92);
    });

    it('should match biweekly extra', async () => {
      const dates = ['2018-05-16', '2018-05-17', '2018-05-30'].map(x => moment(x));
      const match = await PaycheckDetection.getBestScheduleMatch(dates, {
        today: DateOnly.fromString('2018-05-30'),
      });
      expect(match.params).to.deep.equal(['wednesday']);
      expect(match.interval).to.equal(RecurringTransactionInterval.BIWEEKLY);
      expect(match.rollDirection).to.equal(-1);
      expect(match.confidence).to.equal(100);
    });

    it('should match semi monthly', async () => {
      const dates = [
        '2018-03-22T00:00:00.000Z',
        '2018-03-29T00:00:00.000Z',
        '2018-04-05T00:00:00.000Z',
        '2018-05-10T00:00:00.000Z',
        '2018-05-16T00:00:00.000Z',
        '2018-05-23T00:00:00.000Z',
      ].map(x => moment(x));
      const match = await PaycheckDetection.getBestScheduleMatch(dates, {
        today: DateOnly.fromString('2018-05-30'),
      });
      expect(match.params).to.deep.equal(['wednesday']);
      expect(match.interval).to.equal(RecurringTransactionInterval.WEEKLY);
      expect(match.rollDirection).to.equal(-1);
      expect(match.confidence).to.equal(92);
    });

    it('should match weekly with one off', async () => {
      const dates = [
        '2018-05-10T00:00:00.000Z',
        '2018-05-17T00:00:00.000Z',
        '2018-05-23T00:00:00.000Z',
      ].map(x => moment(x));
      const match = await PaycheckDetection.getBestScheduleMatch(dates, {
        today: DateOnly.fromString('2018-05-25'),
      });
      expect(match.params).to.deep.equal(['thursday']);
      expect(match.interval).to.equal(RecurringTransactionInterval.WEEKLY);
      expect(match.rollDirection).to.equal(-1);
      expect(match.confidence).to.equal(92);
    });

    it('should get last day of month correct', async () => {
      const dates = [
        '2018-01-17',
        '2018-02-01',
        '2018-02-15',
        '2018-02-28',
        '2018-03-15',
        '2018-03-30',
        '2018-04-16',
        '2018-05-01',
        '2018-05-15',
      ].map(x => moment(x));
      const match = await PaycheckDetection.getBestScheduleMatch(dates, {
        today: DateOnly.fromString('2018-05-20'),
      });
      expect(match.params).to.deep.equal([1, 16]);
      expect(match.interval).to.equal(RecurringTransactionInterval.SEMI_MONTHLY);
      expect(match.rollDirection).to.equal(-1);
      expect(match.confidence).to.equal(87);
    });

    it('should match weekly', async () => {
      const dates = [
        '2018-05-10T00:00:00.000Z',
        '2018-05-16T00:00:00.000Z',
        '2018-05-23T00:00:00.000Z',
      ].map(x => moment(x));
      const match = await PaycheckDetection.getBestScheduleMatch(dates, {
        today: DateOnly.fromString('2018-05-24'),
      });
      expect(match.params).to.deep.equal(['wednesday']);
      expect(match.interval).to.equal(RecurringTransactionInterval.WEEKLY);
      expect(match.rollDirection).to.equal(-1);
      expect(match.confidence).to.equal(92);
    });

    it('should match biweekly better in beginning', async () => {
      const dates = ['2018-04-09', '2018-04-23', '2018-05-04', '2018-05-18', '2018-06-01'].map(x =>
        moment(x),
      );
      const match = await PaycheckDetection.getBestScheduleMatch(dates, {
        today: DateOnly.fromString('2018-06-03'),
      });
      expect(match.params).to.deep.equal(['friday']);
      expect(match.interval).to.equal(RecurringTransactionInterval.BIWEEKLY);
      expect(match.rollDirection).to.equal(-1);
      expect(match.confidence).to.equal(100);
    });

    it('should match weekday monthly', async () => {
      const dates = [
        '2017-04-11',
        '2017-05-08',
        '2017-06-05',
        '2017-07-03',
        '2017-08-01',
        '2017-08-08',
        '2018-02-05',
        '2018-03-06',
        '2018-03-20',
        '2018-04-17',
        '2018-05-15',
      ].map(x => moment(x));
      const match = await PaycheckDetection.getBestScheduleMatch(dates, {
        today: DateOnly.fromString('2018-05-20'),
      });
      expect(match.params).to.deep.equal([3, 'tuesday']);
      expect(match.interval).to.equal(RecurringTransactionInterval.WEEKDAY_MONTHLY);
      expect(match.rollDirection).to.equal(-1);
      expect(match.confidence).to.equal(100);
    });

    it('should detect weekly with some fuzzy', async () => {
      const dates = [
        '2017-03-02',
        '2017-05-22',
        '2017-08-03',
        '2017-10-17',
        '2018-04-20',
        '2018-04-24',
        '2018-04-30',
        '2018-04-30',
        '2018-05-02',
        '2018-05-08',
        '2018-05-15',
      ].map(x => moment(x));
      const match = await PaycheckDetection.getBestScheduleMatch(dates, {
        today: DateOnly.fromString('2018-05-18'),
      });
      expect(match.params).to.deep.equal(['tuesday']);
      expect(match.interval).to.equal(RecurringTransactionInterval.WEEKLY);
      expect(match.rollDirection).to.equal(-1);
      expect(match.confidence).to.equal(80);
    });

    it('should get best matching schedule from strange paycheck dates', async () => {
      const dates = [
        '2018-06-29',
        '2018-06-15',
        '2018-05-15',
        '2018-04-13',
        '2018-03-15',
        '2018-02-15',
        '2018-01-12',
        '2017-12-15',
        '2017-11-30',
        '2017-11-15',
        '2017-10-31',
        '2017-10-13',
      ].map(x => moment(x));
      const match = await PaycheckDetection.getBestScheduleMatch(dates, {
        today: DateOnly.fromString('2018-07-11'),
      });
      expect(match.params).to.deep.equal([15, -1]);
      expect(match.interval).to.equal(RecurringTransactionInterval.SEMI_MONTHLY);
      expect(match.rollDirection).to.equal(-1);
      expect(match.confidence).to.equal(75);
    });
  });

  it('should not go down to 2 predictions', async () => {
    const dates = [
      '2018-06-18',
      '2018-06-19',
      '2018-06-19',
      '2018-06-20',
      '2018-06-25',
      '2018-06-25',
      '2018-06-25',
      '2018-06-25',
      '2018-06-25',
      '2018-06-26',
      '2018-06-26',
    ].map(x => moment(x));
    const match = await PaycheckDetection.getBestScheduleMatch(dates, {
      today: DateOnly.fromString('2018-06-27'),
    });
    expect(match).to.be.undefined;
  });

  describe('evaluate predictions', () => {
    it('should pair all easy version', () => {
      const dates = ['2017-01-01', '2017-02-01', '2017-03-01'].map(DateOnly.fromString);
      const res = PaycheckDetection.evaluatePredictions(
        dates,
        dates,
        new RSched(RecurringTransactionInterval.MONTHLY, [1], 0),
      );
      expect(res.numPredictions).to.equal(3);
      expect(res.numMatches).to.equal(3);
      res.matchPairs.forEach(pair => expect(pair.diff).to.equal(0));
      expect(res.confidence).to.equal(100);
    });

    it('should decrement confidence when off', () => {
      const observed = ['2017-01-01', '2017-02-01', '2017-03-01'].map(DateOnly.fromString);
      const predicted = ['2017-01-02', '2017-02-03', '2017-03-01'].map(DateOnly.fromString);
      const res = PaycheckDetection.evaluatePredictions(
        predicted,
        observed,
        new RSched(RecurringTransactionInterval.MONTHLY, [1], 0),
      );
      expect(res.numPredictions).to.equal(3);
      expect(res.numMatches).to.equal(3);
      expect(res.confidence).to.equal(75);
    });

    it('should not match if too far off', () => {
      const observed = ['2017-01-01', '2017-02-01', '2017-03-01'].map(DateOnly.fromString);
      const predicted = ['2017-01-02', '2017-02-05', '2017-03-01'].map(DateOnly.fromString);
      const res = PaycheckDetection.evaluatePredictions(
        predicted,
        observed,
        new RSched(RecurringTransactionInterval.MONTHLY, [1], 0),
      );
      expect(res.numPredictions).to.equal(3);
      expect(res.numMatches).to.equal(2);
      expect(res.confidence).to.equal(59);
    });

    it('should match the closest posible if there are 2', () => {
      const observed = ['2017-01-01', '2017-02-03', '2017-02-02', '2017-03-01'].map(
        DateOnly.fromString,
      );
      const predicted = ['2017-01-01', '2017-02-01', '2017-03-01'].map(DateOnly.fromString);
      const res = PaycheckDetection.evaluatePredictions(
        predicted,
        observed,
        new RSched(RecurringTransactionInterval.MONTHLY, [1], 0),
      );
      expect(res.numPredictions).to.equal(3);
      expect(res.numMatches).to.equal(3);
      expect(res.confidence).to.equal(92);
    });
  });

  describe('evaluate predictions with roll', () => {
    it('should pair all with rolling', () => {
      const observed = ['2017-01-03', '2017-02-01', '2017-03-01'].map(DateOnly.fromString);
      const all = PaycheckDetection._evaluateWithRollDirections(
        RecurringTransactionInterval.MONTHLY,
        [1],
        observed,
        DateOnly.fromString('2017-03-02'),
        ROLL_DIRECTIONS,
      );
      expect(all.length).to.equal(5);
      const res = all.sort((a, b) => b.numMatches - a.numMatches + b.confidence - a.confidence)[0];
      expect(res.numPredictions).to.equal(3);
      expect(res.numMatches).to.equal(3);
      res.matchPairs.forEach(pair => expect(pair.diff).to.equal(0));
      expect(res.rollDirection).to.equal(1);
      expect(res.interval).to.equal('MONTHLY');
      expect(res.params).to.deep.equal([1]);
    });
  });

  describe('getScore', () => {
    it('should get good score for good matches', () => {
      const mr = {
        unmatched: [],
        matchPairs: [{ diff: 0 }, { diff: 0 }, { diff: 0 }],
      } as MatchResult;
      const res = PaycheckDetection._getScore(mr, 3);
      expect(res).to.equal(3.641);
    });

    it('should get worse score when there are days off', () => {
      const mr = {
        unmatched: [],
        matchPairs: [{ diff: 1 }, { diff: 2 }, { diff: 0 }],
      } as MatchResult;
      const res = PaycheckDetection._getScore(mr, 3);
      expect(res).to.equal(2.761);
    });

    it('should penalize missing days', () => {
      const mr = {
        unmatched: [],
        matchPairs: [{ diff: -1 }, { diff: 0 }, { diff: 0 }, { diff: 0 }],
      } as MatchResult;
      const res = PaycheckDetection._getScore(mr, 4);
      expect(res).to.equal(2.905);
    });

    it('should heavily penalize missing days at the end', () => {
      const mr = {
        unmatched: [],
        matchPairs: [{ diff: 0 }, { diff: 0 }, { diff: 0 }, { diff: -1 }],
      } as MatchResult;
      const res = PaycheckDetection._getScore(mr, 4);
      expect(res).to.equal(2.177);
    });

    it('should score worse with high maxLen and missing', () => {
      const mr = {
        unmatched: [],
        matchPairs: [{ diff: 0 }, { diff: 0 }, { diff: 0 }, { diff: -1 }],
      } as MatchResult;
      const res = PaycheckDetection._getScore(mr, 10);
      expect(res).to.equal(3.857);
    });

    it('should score same with high maxLen and no missed', () => {
      const mr = {
        unmatched: [],
        matchPairs: [{ diff: 0 }, { diff: 0 }, { diff: 0 }, { diff: 0 }],
      } as MatchResult;
      const res = PaycheckDetection._getScore(mr, 10);
      expect(res).to.equal(9.044);
    });

    it('should subtract umatched length from score', () => {
      const mr = {
        unmatched: [{}, {}],
        matchPairs: [{ diff: 0 }, { diff: 0 }, { diff: 0 }, { diff: 0 }],
      } as MatchResult;
      const res = PaycheckDetection._getScore(mr, 10);
      expect(res).to.equal(7.044);
    });
  });
});
