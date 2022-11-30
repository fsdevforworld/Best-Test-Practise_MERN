import 'mocha';

import { moment } from '@dave-inc/time-lib';
import { expect } from 'chai';

import { main } from '../../src/crons/schedule-payday-past-due-repayments';
import { ABTestingEvent, AdvanceCollectionSchedule } from '../../src/models';
import factory from '../factories';
import clean from '../test-helpers/clean';

describe('schedule-past-due-tivan-advances', () => {
  before(() => {
    return clean();
  });
  it('should only add a collection schedule for past due advances', async () => {
    const expectedDate =
      moment().weekday() >= 5
        ? moment()
            .add(1, 'week')
            .weekday(5)
            .ymd()
        : moment()
            .weekday(5)
            .ymd();
    const pastDueTivanAdvance = await factory.create('advance', {
      outstanding: 100,
      paybackDate: moment()
        .subtract(10, 'day')
        .ymd(),
    });
    const futureTivanAdvance = await factory.create('advance', {
      outstanding: 100,
      paybackDate: moment().ymd(),
    });
    await factory.create('advance', {
      outstanding: 100,
      paybackDate: moment()
        .subtract(10, 'day')
        .ymd(),
    });
    await ABTestingEvent.create({
      eventName: 'TIVAN_REPAYMENT',
      eventUuid: pastDueTivanAdvance.id,
      userId: pastDueTivanAdvance.userId,
    });
    const rc = await factory.create('recurring-transaction', {
      bankAccountId: pastDueTivanAdvance.bankAccountId,
      userId: pastDueTivanAdvance.userId,
      userAmount: 500,
      status: 'VALID',
    });
    await factory.create('expected-transaction', {
      expectedDate,
      bankAccountId: pastDueTivanAdvance.bankAccountId,
      userId: pastDueTivanAdvance.userId,
      recurringTransactionId: rc.id,
    });
    await ABTestingEvent.create({
      eventName: 'TIVAN_REPAYMENT',
      eventUuid: futureTivanAdvance.id,
      userId: futureTivanAdvance.userId,
    });
    await main();

    const schedules = await AdvanceCollectionSchedule.findAll();
    expect(schedules.length).to.eq(1);
    expect(schedules[0].advanceId).to.eq(pastDueTivanAdvance.id);
    expect(schedules[0].windowStart.ymd()).to.eq(expectedDate);
  });
});
