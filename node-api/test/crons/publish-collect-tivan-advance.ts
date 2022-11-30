import { moment, PACIFIC_TIMEZONE } from '@dave-inc/time-lib';
import * as sinon from 'sinon';
import { tivanBatchProcessor } from '../../src/crons/publish-collect-tivan-advances';
import { expect } from 'chai';
import factory from '../factories';
import { TivanProcess } from '../../src/lib/tivan-client';
import { AdvanceCollectionTrigger } from '../../src/typings';
import { stubTivanClient } from '../test-helpers/stub-tivan-client';

describe('Publish collect tivan advance', () => {
  const sandbox = sinon.createSandbox();

  afterEach(() => {
    sandbox.restore();
  });
  it('should schedule a job for midnight if before midnight', async () => {
    const advance = await factory.create('advance');
    const stub = stubTivanClient(sandbox).enqueueTask;
    const time = moment('2020-11-10')
      .tz(PACIFIC_TIMEZONE)
      .startOf('day')
      .subtract(90, 'minutes')
      .toDate();
    sandbox.useFakeTimers(time);

    await tivanBatchProcessor(AdvanceCollectionTrigger.DAILY_CRONJOB, [
      { advanceId: advance.id, isTivanAdvance: true },
    ]);
    expect(stub.firstCall.args[0]).to.deep.eq({
      userId: advance.userId,
      advanceId: advance.id,
      source: AdvanceCollectionTrigger.DAILY_CRONJOB,
      process: TivanProcess.Advance,
    });
    expect(stub.firstCall.args[1].startTime.format()).to.eq(
      moment('2020-11-10')
        .tz(PACIFIC_TIMEZONE)
        .startOf('day')
        .format(),
    );
  });

  it('should not publish a non tivan advance', async () => {
    const advance = await factory.create('advance');
    const stub = stubTivanClient(sandbox).enqueueTask;
    const time = moment('2020-11-10')
      .add(8, 'hours')
      .subtract(10, 'minutes')
      .toDate();
    sandbox.useFakeTimers(time);

    await tivanBatchProcessor(AdvanceCollectionTrigger.DAILY_CRONJOB, [
      { advanceId: advance.id, isTivanAdvance: false },
    ]);
    expect(stub.callCount).to.eq(0);
  });
});
