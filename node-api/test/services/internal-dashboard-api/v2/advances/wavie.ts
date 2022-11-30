import { expect } from 'chai';
import * as request from 'supertest';
import {
  Advance,
  AdvanceTip,
  DashboardActionReason,
  DashboardAdvanceModification,
} from '../../../../../src/models';
import app from '../../../../../src/services/internal-dashboard-api';
import { ActionCode } from '../../../../../src/services/internal-dashboard-api/domain/action-log';
import factory from '../../../../factories';
import { clean, withInternalUser, seedDashboardAction } from '../../../../test-helpers';

describe('POST /v2/advances/:id/waive', () => {
  context('happy path', () => {
    let advance: Advance;
    let dashboardActionReason: DashboardActionReason;
    let res: request.Response;
    before(async () => {
      await clean();

      advance = await factory.create<Advance>('advance', {
        amount: 100,
        fee: 0,
        outstanding: 100,
        paybackFrozen: false,
      });

      await factory.create<AdvanceTip>('advance-tip', {
        advanceId: advance.id,
        amount: 0,
        percent: 0,
      });

      ({ dashboardActionReason } = await seedDashboardAction(ActionCode.WaiveAdvanceOutstanding));

      res = await withInternalUser(
        request(app)
          .post(`/v2/advances/${advance.id}/waive`)
          .send({
            dashboardActionReasonId: dashboardActionReason.id,
            zendeskTicketUrl: 'waive test',
          })
          .expect(200),
      );

      await advance.reload();
    });

    it('sets outstanding to 0', () => {
      expect(advance.outstanding).to.equal(0);
    });

    it('sets paybackFrozen to true', () => {
      expect(advance.paybackFrozen).to.equal(true);
    });

    it('creates an action log and modification', async () => {
      const advanceModification = await DashboardAdvanceModification.scope(
        'withDashboardAction',
      ).findOne({
        where: { advanceId: advance.id },
      });

      const actionLog = advanceModification.dashboardActionLog;
      const reason = actionLog.dashboardActionReason;

      expect(actionLog).to.not.be.null;
      expect(actionLog.zendeskTicketUrl).to.eq('waive test');
      expect(reason.id).to.equal(dashboardActionReason.id);
    });

    it('responds with the serialized advance', () => {
      const {
        body: {
          data: {
            id,
            type,
            attributes: { outstanding, paybackFrozen },
          },
        },
      } = res;

      expect(id).to.equal(`${advance.id}`);
      expect(type).to.equal('advance');
      expect(outstanding).to.equal(0);
      expect(paybackFrozen).to.equal(true);
    });
  });

  context('bad request', () => {
    let advance: Advance;
    let dashboardActionReason: DashboardActionReason;
    let req: request.Test;
    beforeEach(async () => {
      await clean();

      advance = await factory.create<Advance>('advance', { amount: 100, fee: 0, outstanding: 100 });

      await factory.create<AdvanceTip>('advance-tip', {
        advanceId: advance.id,
        amount: 0,
        percent: 0,
      });

      ({ dashboardActionReason } = await seedDashboardAction(ActionCode.WaiveAdvanceOutstanding));

      req = request(app).post(`/v2/advances/${advance.id}/waive`);
    });

    it('validates the action log', async () => {
      const { dashboardActionReason: otherReason } = await seedDashboardAction(
        ActionCode.AdvanceTipChange,
      );

      await withInternalUser(
        req
          .send({
            dashboardActionReasonId: otherReason.id,
            zendeskTicketUrl: 'waive test',
          })
          .expect(400),
      );
    });

    it('throws an error if outstanding is <= 0', async () => {
      await advance.update({ outstanding: 0 });

      await withInternalUser(
        req
          .send({
            dashboardActionReasonId: dashboardActionReason.id,
            zendeskTicketUrl: 'waive test',
          })
          .expect(409),
      );
    });
  });
});
