import { DEFAULT_TIMEZONE, moment } from '@dave-inc/time-lib';
import { fakeDateTime } from '../../test-helpers';
import {
  getAvailableDatesForNoIncome,
  getRangeOfPossiblePaybackDates,
} from '../../../src/domain/advance-delivery';
import { expect } from 'chai';
import factory from '../../factories';
import { AdvanceApproval, AdvancePaybackDatePrediction } from '../../../src/models';
import * as sinon from 'sinon';

describe('payback dates', () => {
  const sandbox = sinon.createSandbox();

  afterEach(() => sandbox.restore());

  describe('getAvailableDatesForNoIncome', () => {
    const today = moment.tz('2020-03-18', 'YYYY-MM-DD', DEFAULT_TIMEZONE);
    const availableDates = ['2020-03-23', '2020-03-24', '2020-03-25', '2020-03-26', '2020-03-27'];

    beforeEach(() => {
      fakeDateTime(sandbox, today);
    });

    it(`should return valid banking dates`, async () => {
      const dates = await getAvailableDatesForNoIncome();

      expect(dates).to.deep.eq(availableDates);
    });

    context('Predicted payback dates', () => {
      [
        {
          testCase:
            'should not include a duplicate predicted date if it is already apart of the default available dates',
          prediction: { date: '2020-03-27', success: true },
          expected: availableDates,
        },
        {
          testCase:
            'should include a predicted date that is within the default window, even if it is a non-banking day',
          prediction: { date: '2020-03-28', success: true },
          expected: [...availableDates, '2020-03-28'],
        },
        {
          testCase: 'should not include a predicted date that was not successful',
          prediction: { date: '2020-03-28', success: false },
          expected: availableDates,
        },
        {
          testCase: 'should not include a predicted date that is not within the default window',
          prediction: { date: '2020-03-30', success: true },
          expected: availableDates,
        },
        {
          testCase: 'should not include a predicted date that is not within the default window',
          prediction: { date: '2020-03-19', success: true },
          expected: availableDates,
        },
      ].forEach(({ testCase, prediction, expected }) => {
        it(testCase, async () => {
          const advanceApproval = await factory.create<AdvanceApproval>('advance-approval', {
            defaultPaybackDate: moment.tz(prediction.date, 'YYYY-MM-DD', DEFAULT_TIMEZONE),
          });
          await factory.create<AdvancePaybackDatePrediction>('advance-payback-date-prediction', {
            advanceApprovalId: advanceApproval.id,
            predictedDate: moment(prediction.date),
            success: prediction.success,
          });

          const dates = await getAvailableDatesForNoIncome({
            advanceApprovalId: advanceApproval.id,
          });

          expect(dates).to.deep.eq(expected);
        });
      });
    });
  });

  describe('Tiny Money (Micro Advance) available dates', () => {
    describe('getRangeOfPossiblePaybackDates', () => {
      [
        {
          today: moment.tz('2020-03-18', 'YYYY-MM-DD', DEFAULT_TIMEZONE),
          expected: moment.range(
            moment.tz('2020-03-22', 'YYYY-MM-DD', DEFAULT_TIMEZONE),
            moment.tz('2020-03-29', 'YYYY-MM-DD', DEFAULT_TIMEZONE),
          ),
        },
        {
          today: moment.tz('2020-03-07', 'YYYY-MM-DD', DEFAULT_TIMEZONE),
          expected: moment.range(
            moment.tz('2020-03-11', 'YYYY-MM-DD', DEFAULT_TIMEZONE),
            moment.tz('2020-03-18', 'YYYY-MM-DD', DEFAULT_TIMEZONE),
          ),
        },
      ].forEach(({ today, expected }) => {
        it('should correctly build a range 4 to 11 days from now, based on current time', () => {
          fakeDateTime(sandbox, today);

          const window = getRangeOfPossiblePaybackDates();

          expect(window.isEqual(expected)).to.be.true;
        });
      });
    });
  });
});
