import * as sinon from 'sinon';
import { clean } from '../../../test-helpers';
import factory from '../../../factories';
import * as AdvanceRepayment from '../../../../src/services/internal-dashboard-api/domain/advance-repayment';
import cron from '../../../../src/services/internal-dashboard-api/crons/update-pending-dashboard-advance-repayments';
import { DashboardAdvanceRepayment } from '../../../../src/models';

describe('Crons - update-pending-dashboard-advance-repayments', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  afterEach(() => clean(sandbox));

  it('calls refresh on advance repayment with status of PENDING', async () => {
    await factory.create<DashboardAdvanceRepayment>('dashboard-advance-repayment', {
      status: 'PENDING',
    });

    const spy = sandbox.stub(AdvanceRepayment, 'refresh').resolves();

    await cron.process();

    sinon.assert.calledOnce(spy);
  });

  (['SUCCEEDED', 'FAILED'] as const).forEach(status => {
    it(`does not call refresh on advance repayment with status: ${status}`, async () => {
      await factory.create<DashboardAdvanceRepayment>('dashboard-advance-repayment', {
        status,
      });

      const spy = sandbox.stub(AdvanceRepayment, 'refresh').resolves();

      await cron.process();

      sinon.assert.notCalled(spy);
    });
  });
});
