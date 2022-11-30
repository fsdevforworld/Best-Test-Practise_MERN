import { expect } from 'chai';

import { clean } from '../test-helpers';
import factory from '../factories';

import { moment } from '@dave-inc/time-lib';
import { Advance, AdvanceCollectionSchedule } from '../../src/models';

describe('AdvanceCollectionAttempt', () => {
  before(() => clean());
  afterEach(() => clean());

  context('#create', () => {
    it('accepts a YYYY-MM-DD formatted string for windowStart and windowEnd', async () => {
      const advance = await factory.create<Advance>('advance');

      const windowStart = moment()
        .add(14, 'days')
        .format('YYYY-MM-DD');
      const windowEnd = moment()
        .add(15, 'days')
        .format('YYYY-MM-DD');

      const advanceCollectionSchedule = await AdvanceCollectionSchedule.create({
        advanceId: advance.id,
        windowStart,
        windowEnd,
      });

      expect(advanceCollectionSchedule.id).to.not.equal(null);
    });
  });
});
