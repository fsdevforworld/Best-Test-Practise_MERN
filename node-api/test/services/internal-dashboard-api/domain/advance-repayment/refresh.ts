import { expect } from 'chai';
import { moment } from '@dave-inc/time-lib';
import { clean, replayHttp } from '../../../../test-helpers';
import factory from '../../../../factories';
import { refresh } from '../../../../../src/services/internal-dashboard-api/domain/advance-repayment';
import { DashboardAdvanceRepayment, DashboardPayment } from '../../../../../src/models';

describe('Advance Repayment - refresh', () => {
  before(() => clean());

  afterEach(() => clean());

  context('successfully fetched task', () => {
    let advanceRepayment: DashboardAdvanceRepayment;
    beforeEach(
      replayHttp(
        'services/internal-dashboard-api/domain/advance-repayment/refresh-success.json',
        async () => {
          advanceRepayment = await factory.create<DashboardAdvanceRepayment>(
            'dashboard-advance-repayment',
            {
              status: 'PENDING',
              tivanTaskId: 'tivan-user_advance-id_test-1',
            },
          );

          await refresh(advanceRepayment);
        },
      ),
    );

    it('updates the status for the advance repayment', async () => {
      await advanceRepayment.reload();

      expect(advanceRepayment.status).to.equal('FAILED');
    });

    it('associates the payments to the repayment', async () => {
      const dashboardPayments = await DashboardPayment.findAll({
        where: {
          tivanTaskId: 'tivan-user_advance-id_test-1',
        },
      });

      const tivanReferenceIds = dashboardPayments.map(p => p.tivanReferenceId);

      expect(tivanReferenceIds.length).to.equal(2);
      expect(tivanReferenceIds).to.include('0fdfd30a-342d-578d-85bc-abf7d9a12b78');
      expect(tivanReferenceIds).to.include('26b9dcfb-be8d-5044-a043-f98895238f2a');

      const paymentReferenceIds = dashboardPayments.map(p => p.paymentReferenceId);
      expect(paymentReferenceIds).to.include('0fdfd30a-342d-57');
      expect(paymentReferenceIds).to.include('26b9dcfb-be8d-50');
    });
  });

  context('task not found in Tivan', () => {
    const tivanTaskId = 'not-found-task';
    const fixtureName =
      'services/internal-dashboard-api/domain/advance-repayment/refresh-not-found.json';

    it(
      'updates the status to FAILED after 1 hour',
      replayHttp(fixtureName, async () => {
        const created = moment().subtract(61, 'minutes');

        const advanceRepayment = await factory.create<DashboardAdvanceRepayment>(
          'dashboard-advance-repayment',
          {
            status: 'PENDING',
            tivanTaskId,
            created,
          },
        );

        await refresh(advanceRepayment).catch(() => {});

        await advanceRepayment.reload();

        expect(advanceRepayment.status).to.equal('FAILED');
      }),
    );

    it(
      'does not update the repayment prior to 1 hour',
      replayHttp(fixtureName, async () => {
        const created = moment().subtract(58, 'minutes');

        const advanceRepayment = await factory.create<DashboardAdvanceRepayment>(
          'dashboard-advance-repayment',
          {
            status: 'PENDING',
            tivanTaskId,
            created,
          },
        );

        await refresh(advanceRepayment).catch(() => {});

        await advanceRepayment.reload();

        expect(advanceRepayment.status).to.equal('PENDING');
      }),
    );
  });
});
