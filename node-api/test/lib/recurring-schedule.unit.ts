import { DateOnly, moment } from '@dave-inc/time-lib';
import 'mocha';
import { expect } from 'chai';
import { MONTLY_PARAMS_INVALID, RSched } from '../../src/lib/recurring-schedule';
import { RecurringTransactionInterval } from '@dave-inc/wire-typings';

describe('RSched', () => {
  describe('init rsched', () => {
    it('should handle a null dtstart', () => {
      const dtstart = DateOnly.fromString('2017-12-12');
      const rsched = new RSched(RecurringTransactionInterval.SEMI_MONTHLY, [15, -1], -1, null);
      const dates = rsched.between(dtstart, DateOnly.fromMoment(moment()));
      expect(dates[0].toString()).to.equal('2017-12-15');
    });
    describe('semi_monthly interval', async () => {
      it('should parse a monthly rsched', () => {
        const dtstart = DateOnly.fromString('2017-12-12');

        const rsched = new RSched(RecurringTransactionInterval.SEMI_MONTHLY, [15, -1]);
        const dates = rsched.between(dtstart, DateOnly.fromMoment(moment()));
        expect(dates[1].toString()).to.equal('2017-12-31');
        expect(dates[0].toString()).to.equal('2017-12-15');
      });

      it('should roll to weekday if exclude monthly weekends is set ', () => {
        const dtstart = DateOnly.fromString('2017-12-12');
        const rsched = new RSched(RecurringTransactionInterval.SEMI_MONTHLY, [15, -1], 1);
        const dates = rsched.between(dtstart, DateOnly.fromMoment(moment()));
        expect(dates[1].toString()).to.equal('2018-01-02');
        expect(dates[0].toString()).to.equal('2017-12-15');
      });

      it('should roll off of holidays', () => {
        const dtstart = DateOnly.fromString('2017-12-12');
        const rsched = new RSched(RecurringTransactionInterval.SEMI_MONTHLY, [1, 15], 1);
        const dates = rsched.between(dtstart, DateOnly.fromMoment(moment()));
        expect(dates[1].toString()).to.equal('2018-01-02');
        expect(dates[0].toString()).to.equal('2017-12-15');
      });

      it('month days should roll forward', () => {
        const dtstart = DateOnly.fromString('2017-12-12');

        const rsched = new RSched(RecurringTransactionInterval.SEMI_MONTHLY, [17, -1], 1);
        const dates = rsched.between(dtstart, DateOnly.fromMoment(moment()));
        expect(dates[1].toString()).to.equal('2018-01-02');
        expect(dates[0].toString()).to.equal('2017-12-18');
      });

      it('should fail if two params are not passed ', () => {
        expect(
          () =>
            new RSched(
              RecurringTransactionInterval.SEMI_MONTHLY,
              [-1],
              1,
              DateOnly.fromString('2017-12-12'),
            ),
        ).to.throw('params should be array of integers with length 2');
      });

      it('before should choose the correct date', () => {
        const dtstart = DateOnly.fromString('2017-12-12');
        const rsched = new RSched(RecurringTransactionInterval.SEMI_MONTHLY, [11, 13], 0);
        const date = rsched.before(dtstart);
        expect(date.toString()).to.equal('2017-12-11');
      });

      it('before inclusive on today should choose the correct date', () => {
        const dtstart = DateOnly.fromString('2017-12-12');
        const rsched = new RSched(RecurringTransactionInterval.SEMI_MONTHLY, [8, 12], 0);
        const date = rsched.before(dtstart, true);
        expect(date.toString()).to.equal('2017-12-12');
      });

      it('after should choose the correct date', () => {
        const dtstart = DateOnly.fromString('2017-12-12');
        const rsched = new RSched(RecurringTransactionInterval.SEMI_MONTHLY, [11, 13], 0);
        const date = rsched.after(dtstart);
        expect(date.toString()).to.equal('2017-12-13');
      });

      it('after should choose the correct date end of month', () => {
        const dtstart = DateOnly.fromString('2017-12-12');
        const rsched = new RSched(RecurringTransactionInterval.SEMI_MONTHLY, [25, -1], 0);
        const date = rsched.after(dtstart);
        expect(date.toString()).to.equal('2017-12-25');
      });

      it('after should choose the correct date end of month', () => {
        const dtstart = DateOnly.fromString('2017-12-26');
        const rsched = new RSched(RecurringTransactionInterval.SEMI_MONTHLY, [25, -1], 0);
        const date = rsched.after(dtstart);
        expect(date.toString()).to.equal('2017-12-31');
      });
    });

    describe('monthly_interval', async () => {
      it('monthly should be on the same day each month', () => {
        const dtstart = DateOnly.fromString('2017-12-12');

        const rsched = new RSched(RecurringTransactionInterval.MONTHLY, [15], 1);
        const dates = rsched.between(dtstart, DateOnly.fromMoment(moment()));
        expect(dates[0].toString()).to.equal('2017-12-15');
        expect(dates[1].toString()).to.equal('2018-01-16');
      });

      it('monthly should roll forward if excludeMONTHLYWeekends is true', () => {
        const dtstart = DateOnly.fromString('2017-12-12');
        const rsched = new RSched(RecurringTransactionInterval.MONTHLY, [17], 1);
        const dates = rsched.between(dtstart, DateOnly.fromMoment(moment()));
        expect(dates[0].toString()).to.equal('2017-12-18');
        expect(dates[1].toString()).to.equal('2018-01-17');
      });

      it('monthly should use the start of the month if no param is provided', () => {
        const dtstart = DateOnly.fromString('2017-12-12');
        const rsched = new RSched(RecurringTransactionInterval.MONTHLY, [], 0);
        const dates = rsched.between(dtstart, DateOnly.fromMoment(moment()));
        expect(dates[0].toString()).to.equal('2018-01-01');
        expect(dates[1].toString()).to.equal('2018-02-01');
      });

      it('before should choose correct date if inclusive', () => {
        const dtstart = DateOnly.fromString('2019-01-15');
        const rsched = new RSched(RecurringTransactionInterval.MONTHLY, [15]);
        const date = rsched.before(dtstart, true);
        expect(date.toString()).to.equal('2019-01-15');
      });

      it('monthly should support last day monthly roll back', () => {
        const dtstart = DateOnly.fromString('2017-01-01');

        const rsched = new RSched(RecurringTransactionInterval.MONTHLY, [-1], -1);
        const dates = rsched.between(dtstart, DateOnly.fromString('2018-01-02'));
        const justDates = dates.map((x: any) => [x.month + 1, x.date]);
        expect(justDates).to.deep.equal([
          [1, 31],
          [2, 28],
          [3, 31],
          [4, 28],
          [5, 31],
          [6, 30],
          [7, 31],
          [8, 31],
          [9, 29],
          [10, 31],
          [11, 30],
          [12, 29],
        ]);
      });

      it('monthly should support last day monthly roll forward', () => {
        const dtstart = DateOnly.fromString('2017-01-01');
        const rsched = new RSched(RecurringTransactionInterval.MONTHLY, [-1], 1);
        const dates = rsched.between(dtstart, DateOnly.fromString('2018-01-02'), true);
        const justDates = dates.map((x: any) => [x.month + 1, x.date]);
        expect(justDates).to.deep.equal([
          [1, 3],
          [1, 31],
          [2, 28],
          [3, 31],
          [5, 1],
          [5, 31],
          [6, 30],
          [7, 31],
          [8, 31],
          [10, 2],
          [10, 31],
          [11, 30],
          [1, 2],
        ]);
      });

      it('monthly should support last day monthly without rolling', () => {
        const dtstart = DateOnly.fromString('2017-01-01');
        const rsched = new RSched(RecurringTransactionInterval.MONTHLY, [-1], 0);
        const dates = rsched.between(dtstart, DateOnly.fromString('2018-01-02'));
        const justDates = dates.map((x: any) => [x.month + 1, x.date]);
        expect(justDates).to.deep.equal([
          [1, 31],
          [2, 28],
          [3, 31],
          [4, 30],
          [5, 31],
          [6, 30],
          [7, 31],
          [8, 31],
          [9, 30],
          [10, 31],
          [11, 30],
          [12, 31],
        ]);
      });
    });

    describe('weekly interval', () => {
      it('should get every friday', () => {
        const dtstart = DateOnly.fromString('2017-12-12');

        const rsched = new RSched(RecurringTransactionInterval.WEEKLY, ['friday']);
        const dates = rsched.between(dtstart, DateOnly.fromMoment(moment()));
        expect(dates[0].toString()).to.equal('2017-12-15');
        expect(dates[1].toString()).to.equal('2017-12-22');
      });

      it('should get every friday with weeklystart', () => {
        const dtstart = DateOnly.fromString('2017-12-12');

        const rsched = new RSched(
          RecurringTransactionInterval.WEEKLY,
          ['friday'],
          0,
          DateOnly.fromMoment(moment()),
        );
        const dates = rsched.between(dtstart, DateOnly.fromMoment(moment()));
        expect(dates[0].toString()).to.equal('2017-12-15');
        expect(dates[1].toString()).to.equal('2017-12-22');
      });

      it('should fail for invalid day', () => {
        const rsched = () => new RSched(RecurringTransactionInterval.WEEKLY, ['bacon', 'thursday']);
        expect(rsched).to.throw('params must be an array of lowercased weekdays');
      });

      it('should get every tuesday and thursday', () => {
        const dtstart = DateOnly.fromString('2017-12-11');

        const rsched = new RSched(RecurringTransactionInterval.WEEKLY, ['tuesday', 'thursday']);
        const dates = rsched.between(dtstart, DateOnly.fromMoment(moment()));

        expect(dates[0].toString()).to.equal('2017-12-12');
        expect(dates[1].toString()).to.equal('2017-12-14');
        expect(dates[2].toString()).to.equal('2017-12-19');
        expect(dates[3].toString()).to.equal('2017-12-21');
      });

      describe('before', () => {
        it('should get the day from the previous week', () => {
          const rsched = new RSched(RecurringTransactionInterval.WEEKLY, ['friday']);
          const date = rsched.before(DateOnly.fromString('2017-12-11'), true);
          expect(date.toString()).to.equal('2017-12-08');
        });

        it('should get the most recent with multiple params', () => {
          const rsched = new RSched(RecurringTransactionInterval.WEEKLY, ['tuesday', 'thursday']);
          const date = rsched.before(DateOnly.fromString('2017-12-15'), true);
          expect(date.toString()).to.equal('2017-12-14');
        });

        it('should get the most recent when between multiple params', () => {
          const rsched = new RSched(RecurringTransactionInterval.WEEKLY, ['tuesday', 'thursday']);
          const date = rsched.before(DateOnly.fromString('2017-12-13'), true);
          expect(date.toString()).to.equal('2017-12-12');
        });
      });

      describe('after', () => {
        it('should get the correct date this week', () => {
          const rsched = new RSched(RecurringTransactionInterval.WEEKLY, ['friday']);
          const date = rsched.after(DateOnly.fromString('2017-12-11'), true);
          expect(date.toString()).to.equal('2017-12-15');
        });

        it('should get the correct date next week', () => {
          const rsched = new RSched(RecurringTransactionInterval.WEEKLY, ['monday']);
          const date = rsched.after(DateOnly.fromString('2017-12-08'), true);
          expect(date.toString()).to.equal('2017-12-11');
        });

        it('should get closest date with multiple params', () => {
          const rsched = new RSched(RecurringTransactionInterval.WEEKLY, ['tuesday', 'thursday']);
          const date = rsched.after(DateOnly.fromString('2017-12-15'), true);
          expect(date.toString()).to.equal('2017-12-19');
        });

        it('should get the next date when between two params', () => {
          const rsched = new RSched(RecurringTransactionInterval.WEEKLY, ['tuesday', 'thursday']);
          const date = rsched.after(DateOnly.fromString('2017-12-13'), true);
          expect(date.toString()).to.equal('2017-12-14');
        });
      });
    });

    describe('biweekly interval', () => {
      it('should get every other friday', () => {
        const dtstart = DateOnly.fromString('2017-12-12');

        const rsched = new RSched(RecurringTransactionInterval.BIWEEKLY, ['friday'], 0, dtstart);
        const dates = rsched.between(dtstart, DateOnly.fromMoment(moment()));
        expect(dates[0].toString()).to.equal('2017-12-15');
        expect(dates[1].toString()).to.equal('2017-12-29');
      });

      it('should get every other friday with dtstart between', () => {
        const dtstart = DateOnly.fromString('2017-12-29');

        const rsched = new RSched(RecurringTransactionInterval.BIWEEKLY, ['friday'], 0, dtstart);
        const dates = rsched.between(
          DateOnly.fromString('2017-12-12'),
          DateOnly.fromMoment(moment()),
        );
        expect(dates[0].toString()).to.equal('2017-12-15');
        expect(dates[1].toString()).to.equal('2017-12-29');
      });

      it('should get the correct dates', () => {
        const dtstart = DateOnly.fromString('2017-05-01');

        const rsched = new RSched(RecurringTransactionInterval.BIWEEKLY, ['friday'], 0, dtstart);
        const dates = rsched.between(dtstart, DateOnly.fromMoment(moment()));
        expect(dates[0].toString()).to.equal('2017-05-05');
        expect(dates[1].toString()).to.equal('2017-05-19');
      });

      it('should get the correct dates when dtstart is after before inclusive', () => {
        const dtstart = DateOnly.fromString('2017-05-14');

        const rsched = new RSched(RecurringTransactionInterval.BIWEEKLY, ['friday'], 0, dtstart);
        const date = rsched.before(DateOnly.fromString('2017-04-21'), true);
        expect(date.toString()).to.equal('2017-04-21');
      });

      it('should get the correct dates when dtstart is after before exclusive', () => {
        const dtstart = DateOnly.fromString('2017-05-14');

        const rsched = new RSched(RecurringTransactionInterval.BIWEEKLY, ['friday'], 0, dtstart);
        const date = rsched.before(DateOnly.fromString('2017-04-21'), false);
        expect(date.toString()).to.equal('2017-04-07');
      });

      it('should get the correct dates when dtstart is much before before inclusive', () => {
        const dtstart = DateOnly.fromString('2017-03-20');

        const rsched = new RSched(RecurringTransactionInterval.BIWEEKLY, ['friday'], 0, dtstart);
        const date = rsched.before(DateOnly.fromString('2017-04-21'), true);
        expect(date.toString()).to.equal('2017-04-21');
      });

      it('should get the correct dates when dtstart is much after before inclusive', () => {
        const dtstart = DateOnly.fromString('2017-05-14');

        const rsched = new RSched(RecurringTransactionInterval.BIWEEKLY, ['friday'], 0, dtstart);
        const date = rsched.after(DateOnly.fromString('2017-04-07'), true);
        expect(date.toString()).to.equal('2017-04-07');
      });

      it('should use same week day', () => {
        const dtstart = DateOnly.fromString('2017-01-04');

        const rsched = new RSched(RecurringTransactionInterval.BIWEEKLY, ['friday'], 0, dtstart);
        const dates = rsched.between(dtstart, DateOnly.fromMoment(moment()));
        expect(dates[0].toString()).to.equal('2017-01-06');
        expect(dates[1].toString()).to.equal('2017-01-20');
      });

      it('should use same week monday', () => {
        const dtstart = DateOnly.fromString('2016-12-30');

        const rsched = new RSched(RecurringTransactionInterval.BIWEEKLY, ['monday'], 0, dtstart);
        const dates = rsched.between(dtstart, DateOnly.fromMoment(moment()));
        expect(dates[0].toString()).to.equal('2017-01-02');
        expect(dates[1].toString()).to.equal('2017-01-16');
      });

      it('should use same day monday', () => {
        const dtstart = DateOnly.fromString('2017-01-02');

        const rsched = new RSched(RecurringTransactionInterval.BIWEEKLY, ['monday'], 0, dtstart);
        const dates = rsched.between(dtstart, DateOnly.fromMoment(moment()), true);
        expect(dates[0].toString()).to.equal('2017-01-02');
        expect(dates[1].toString()).to.equal('2017-01-16');
      });

      it('should use same day monday end of day', () => {
        const dtstart = moment('2017-01-02').endOf('day');

        const rsched = new RSched(RecurringTransactionInterval.BIWEEKLY, ['monday'], 0, dtstart);
        const dates = rsched.between(dtstart, moment(), true);
        expect(dates[0].format('YYYY-MM-DD')).to.equal('2017-01-02');
        expect(dates[1].format('YYYY-MM-DD')).to.equal('2017-01-16');
      });

      it('should use same day sunday', () => {
        const dtstart = moment('2017-01-01').startOf('day');
        const rsched = new RSched(RecurringTransactionInterval.BIWEEKLY, ['sunday'], 0, dtstart);
        const dates = rsched.between(dtstart, moment(), true);
        expect(dates[0].format('YYYY-MM-DD')).to.equal('2017-01-01');
        expect(dates[1].format('YYYY-MM-DD')).to.equal('2017-01-15');
      });

      it('should use same day sunday end of day', () => {
        const dtstart = moment('2017-01-01').endOf('day');
        const rsched = new RSched(RecurringTransactionInterval.BIWEEKLY, ['sunday'], 0, dtstart);
        const dates = rsched.between(dtstart, moment(), true);
        expect(dates[0].format('YYYY-MM-DD')).to.equal('2017-01-01');
        expect(dates[1].format('YYYY-MM-DD')).to.equal('2017-01-15');
      });

      it('should fail for invalid day', () => {
        const dtstart = DateOnly.fromString('2017-12-12');
        const rschedF = () =>
          new RSched(RecurringTransactionInterval.BIWEEKLY, ['bacon'], 0, dtstart);
        expect(rschedF).to.throw('params[0] must be lowercased weekday');
      });

      it('should fail without dtstart', () => {
        const rschedF = () => new RSched(RecurringTransactionInterval.BIWEEKLY, ['bacon'], 0);
        expect(rschedF).to.throw('params[0] must be lowercased weekday');
      });
    });

    describe('weekday monthly', () => {
      it('should get the correct dates', () => {
        const dtstart = DateOnly.fromString('2017-01-01');
        const rsched = new RSched(RecurringTransactionInterval.WEEKDAY_MONTHLY, [1, 'friday'], 0);
        const dates = rsched.between(dtstart, DateOnly.fromString('2018-01-02'));
        const justDates = dates.map((x: any) => [x.month + 1, x.date]);
        expect(justDates).to.deep.equal([
          [1, 6],
          [2, 3],
          [3, 3],
          [4, 7],
          [5, 5],
          [6, 2],
          [7, 7],
          [8, 4],
          [9, 1],
          [10, 6],
          [11, 3],
          [12, 1],
        ]);
      });
    });

    it('should fail with invalid interval', () => {
      const rsched = () => new RSched('cheese' as RecurringTransactionInterval, ['bacon']);
      expect(rsched).to.throw('Unrecognized Interval');
    });

    it('should fail with monthly interval param zero', () => {
      const rsched = () => new RSched(RecurringTransactionInterval.MONTHLY, [0]);
      expect(rsched).to.throw(MONTLY_PARAMS_INVALID);
    });

    it('will not break with a last month first sunday error', () => {
      const dtstart = DateOnly.fromString('2017-12-21');
      const rsched = new RSched(RecurringTransactionInterval.WEEKDAY_MONTHLY, [1, 'sunday'], 0);
      const dates = rsched.between(dtstart, DateOnly.fromString('2018-07-31'));
      const justDates = dates.map((x: any) => [x.month + 1, x.date]);
      expect(justDates).to.deep.equal([
        [1, 7],
        [2, 4],
        [3, 4],
        [4, 1],
        [5, 6],
        [6, 3],
        [7, 1],
      ]);
    });
  });
});
