import 'mocha';
import { moment, PACIFIC_TIMEZONE } from '@dave-inc/time-lib';
import { expect } from 'chai';
import * as sinon from 'sinon';

import { run } from '../../src/crons/publish-collect-scheduled-tivan-advances';
import { ABTestingEvent, AdvanceCollectionSchedule } from '../../src/models';
import factory from '../factories';
import clean from '../test-helpers/clean';
import * as Repayment from '../../src/domain/repayment';
import { AdvanceCollectionTrigger } from '../../src/typings';

describe('publish-scheduled-tivan-advances', () => {
  const sandbox = sinon.createSandbox();
  before(() => {
    return clean();
  });
  afterEach(() => {
    sandbox.restore();
  });
  it('should publish a bucketed tivan advance', async () => {
    const stub = sandbox.stub(Repayment, 'createAdvanceRepaymentTask').resolves();
    const pstToday = moment()
      .tz(PACIFIC_TIMEZONE, true)
      .startOf('day');
    const pastDueTivanAdvance = await factory.create('advance', {
      outstanding: 100,
      paybackDate: pstToday
        .clone()
        .subtract(10, 'day')
        .ymd(),
    });
    await ABTestingEvent.create({
      eventName: 'TIVAN_REPAYMENT',
      eventUuid: pastDueTivanAdvance.id,
      userId: pastDueTivanAdvance.userId,
    });
    await AdvanceCollectionSchedule.create({
      advanceId: pastDueTivanAdvance.id,
      windowStart: pstToday.clone().ymd(),
      windowEnd: pstToday.clone().ymd(),
    });

    sandbox.useFakeTimers(pstToday.toDate());

    await run();
    expect(stub.callCount).to.eq(1);
    expect(stub.firstCall.args[1]).to.equal(AdvanceCollectionTrigger.PAYDAY_CATCHUP);
    expect(stub.firstCall.args[2].startTime.format()).to.equal(
      pstToday
        .clone()
        .add(6, 'hours')
        .format(),
    );
  });
});
