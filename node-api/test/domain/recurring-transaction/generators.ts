import * as Generator from '../../../src/domain/recurring-transaction/generators';
import * as sinon from 'sinon';
import { moment, Moment } from '@dave-inc/time-lib';
import { expect } from 'chai';
import 'mocha';
import { clean, up } from '../../test-helpers';
import factory from '../../factories';
import stubBankTransactionClient from '../../test-helpers/stub-bank-transaction-client';

describe('recurring-transaction/generators', () => {
  const sandbox = sinon.createSandbox();

  // clean everything before we start
  before(() => clean());

  // insert user and user_session data
  beforeEach(async () => {
    stubBankTransactionClient(sandbox);
    await up();
  }); //truncate user and user_session data
  afterEach(() => clean(sandbox));

  describe('getNextExpectedPaycheckForAccount', () => {
    it('should get the next expected if trxn id supplied', async () => {
      const prediction = await Generator.getNextExpectedPaycheckForAccount(710, 110);
      expect(prediction.recurringTransactionId).to.equal(110);
      const dayINeed = 3;
      let expected: any;
      if (moment().isoWeekday() < dayINeed) {
        expected = moment()
          .isoWeekday(dayINeed)
          .format('YYYY-MM-DD');
      } else {
        expected = moment()
          .add(1, 'weeks')
          .isoWeekday(dayINeed)
          .format('YYYY-MM-DD');
      }
      expect(prediction.expectedDate.format('YYYY-MM-DD')).to.equal(expected);
    });

    it('should return null if main paycheck id does not exist', async () => {
      const prediction = await Generator.getNextExpectedPaycheckForAccount(710, 1101);
      expect(prediction).to.be.null;
    });

    it('should return null if main paycheck id is null', async () => {
      const prediction = await Generator.getNextExpectedPaycheckForAccount(710, null);
      expect(prediction).to.be.null;
    });
  });

  describe('getByAccountId', () => {
    it('should get all by account id', async () => {
      const expectedEndDate = '2018-01-15';
      const startDate = '2017-12-12';
      const accountId = 100;
      const result = await Generator.getByAccountId(accountId, startDate, expectedEndDate);
      expect(result.length).to.equal(5);
      expect(result[0].expectedDate.format('YYYY-MM-DD')).to.equal('2017-12-15');
      expect(result[1].expectedDate.format('YYYY-MM-DD')).to.equal('2017-12-22');
    });
  });

  describe('generateNextExpected', () => {
    it('should generate the next expected', async () => {
      const rt = await factory.create('recurring-transaction', {
        params: [5],
        interval: 'monthly',
        userAmount: 5,
        dtstart: moment('2017-01-01').startOf('day'),
      });

      const next: {
        expectedDate: Moment;
      } = await Generator.getNextExpectedTransaction(rt, moment());
      expect(next.expectedDate.date()).to.equal(5);
    });

    it('should generate next expected with an old today', async () => {
      const rt = await factory.create('recurring-transaction', {
        params: [5],
        interval: 'monthly',
        userAmount: 5,
        dtstart: moment('2017-01-01').startOf('day'),
      });

      const next: {
        expectedDate: Moment;
      } = await Generator.getNextExpectedTransaction(rt, moment('2017-01-01'));
      expect(next.expectedDate.format('YYYY-MM-DD')).to.equal('2017-01-05');
    });

    it('should generate next expected with a date string date', async () => {
      const rt = await factory.create('recurring-transaction', {
        params: [5],
        interval: 'monthly',
        userAmount: 5,
        dtstart: moment('2017-01-01'),
      });

      const next: {
        expectedDate: Moment;
      } = await Generator.getNextExpectedTransaction(rt, moment('2017-01-01'));
      expect(next.expectedDate.format('YYYY-MM-DD')).to.equal('2017-01-05');
    });
  });

  describe('getExpectedInRange', () => {
    it('should generate multiple in the range', async () => {
      const rt = await factory.create('recurring-transaction', {
        params: [5],
        interval: 'monthly',
        userAmount: -5,
        dtstart: moment('2017-01-01'),
      });

      const now = moment();
      const all = await Generator.getExpectedInRange(
        rt,
        now,
        moment()
          .add(2, 'months')
          .subtract(1, 'day'),
      );
      expect(all.length).to.equal(2);
      const expected: Moment = all[0].expectedDate;
      expect(expected.date()).to.equal(rt.params[0]);
    });
  });
});
