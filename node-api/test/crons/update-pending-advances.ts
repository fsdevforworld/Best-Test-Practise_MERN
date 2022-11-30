import { clean } from '../test-helpers';
import { expect } from 'chai';
import * as sinon from 'sinon';
import factory from '../factories';
import * as UpdatePendingAdvancesTask from '../../src/crons/update-pending-advances';
import { moment } from '@dave-inc/time-lib';
import { AdvanceDelivery, ExternalTransactionStatus } from '@dave-inc/wire-typings';
import * as JobsData from '../../src/jobs/data';

describe('UpdatePendingAdvancesTask', () => {
  const sandbox = sinon.createSandbox();
  let updateDisbursementStatusStub: sinon.SinonStub;

  beforeEach(() => {
    updateDisbursementStatusStub = sandbox.stub(JobsData, 'createUpdateDisbursementStatusTask');
  });

  afterEach(() => Promise.all([clean(sandbox)]));

  it('queues a job for express advances that are pending', async () => {
    const advance = await factory.create('advance', {
      disbursementStatus: ExternalTransactionStatus.Pending,
      delivery: AdvanceDelivery.Express,
    });

    await UpdatePendingAdvancesTask.run();
    expect(updateDisbursementStatusStub.callCount).to.eq(1);
    expect(updateDisbursementStatusStub.firstCall.args[0]).to.deep.equal({
      advanceId: advance.id,
    });
  });

  it('queues a job for express advances that are unknown', async () => {
    const advance = await factory.create('advance', {
      disbursementStatus: ExternalTransactionStatus.Unknown,
      delivery: AdvanceDelivery.Express,
    });

    await UpdatePendingAdvancesTask.run();
    expect(updateDisbursementStatusStub.callCount).to.eq(1);
    expect(updateDisbursementStatusStub.firstCall.args[0]).to.deep.equal({
      advanceId: advance.id,
    });
  });

  it('queues a job for pending standard advances that have not been updated in the past 3 days', async () => {
    const advance = await factory.create('advance', {
      disbursementStatus: ExternalTransactionStatus.Unknown,
      delivery: AdvanceDelivery.Standard,
      updated: moment().subtract(4, 'days'),
    });
    await UpdatePendingAdvancesTask.run();
    expect(updateDisbursementStatusStub.callCount).to.eq(1);
    expect(updateDisbursementStatusStub.firstCall.args[0]).to.deep.equal({
      advanceId: advance.id,
    });
  });

  it('queues a job for unknown standard advances', async () => {
    const advance = await factory.create('advance', {
      disbursementStatus: ExternalTransactionStatus.Unknown,
      delivery: AdvanceDelivery.Standard,
    });
    await UpdatePendingAdvancesTask.run();
    expect(updateDisbursementStatusStub.callCount).to.eq(1);
    expect(updateDisbursementStatusStub.firstCall.args[0]).to.deep.equal({
      advanceId: advance.id,
    });
  });

  it('does not queue a job for advances that are not pending', async () => {
    await factory.create('advance', {
      disbursementStatus: ExternalTransactionStatus.Completed,
      delivery: AdvanceDelivery.Express,
    });

    await UpdatePendingAdvancesTask.run();
    expect(updateDisbursementStatusStub.callCount).to.eq(0);
  });
});
