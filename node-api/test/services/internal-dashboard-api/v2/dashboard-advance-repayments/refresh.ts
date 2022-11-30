import { clean, replayHttp, withInternalUser } from '../../../../test-helpers';
import { DashboardAdvanceRepayment } from '../../../../../src/models';
import factory from '../../../../factories';
import * as request from 'supertest';
import { expect } from 'chai';
import app from '../../../../../src/services/internal-dashboard-api';

describe(`POST /v2/dashboard-advance-repayments/:advanceRepaymentId`, () => {
  before(() => clean());

  afterEach(() => clean());

  describe('successful advance repayment refresh', () => {
    let advanceRepayment: DashboardAdvanceRepayment;

    beforeEach(
      replayHttp(
        'services/internal-dashboard-api/v2/dashboard-advance-repayments/refresh-success.json',
        async () => {
          advanceRepayment = await factory.create<DashboardAdvanceRepayment>(
            'dashboard-advance-repayment',
            {
              status: 'PENDING',
              tivanTaskId: 'tivan-admin-manual-creation_advance-id_93546179-1610740468',
            },
          );

          await withInternalUser(
            request(app)
              .post(`/v2/dashboard-advance-repayments/${advanceRepayment.tivanTaskId}/refresh`)
              .expect(200),
          );
        },
      ),
    );

    it('should update the status to SUCCEEDED', async () => {
      const dashboardPayment = await DashboardAdvanceRepayment.findByPk(
        advanceRepayment.tivanTaskId,
      );

      expect(dashboardPayment.status).to.be.equal('SUCCEEDED');
    });
  });

  describe('failed advance repayment refresh', () => {
    let advanceRepayment: DashboardAdvanceRepayment;

    beforeEach(
      replayHttp(
        'services/internal-dashboard-api/v2/dashboard-advance-repayments/refresh-failure.json',
        async () => {
          advanceRepayment = await factory.create<DashboardAdvanceRepayment>(
            'dashboard-advance-repayment',
            {
              status: 'PENDING',
              tivanTaskId: 'tivan-user_advance-id_test-1',
            },
          );

          await withInternalUser(
            request(app)
              .post(`/v2/dashboard-advance-repayments/${advanceRepayment.tivanTaskId}/refresh`)
              .expect(200),
          );
        },
      ),
    );

    it('should update the status to FAILED', async () => {
      const dashboardPayment = await DashboardAdvanceRepayment.findByPk(
        advanceRepayment.tivanTaskId,
      );

      expect(dashboardPayment.status).to.be.equal('FAILED');
    });
  });
});
