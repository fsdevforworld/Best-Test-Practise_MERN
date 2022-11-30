import * as request from 'supertest';
import app from '../../../../../src/services/internal-dashboard-api';
import { expect } from 'chai';
import { clean, createInternalUser, withInternalUser } from '../../../../test-helpers';
import factory from '../../../../factories';
import {
  DashboardAction,
  DashboardActionLog,
  DashboardActionLogMembershipPause,
  DashboardActionReason,
  MembershipPause,
  User,
} from '../../../../../src/models';
import { ActionCode } from '../../../../../src/services/internal-dashboard-api/domain/action-log';
import { moment } from '@dave-inc/time-lib';
import { ACTIVE_TIMESTAMP } from '../../../../../src/lib/sequelize';

describe('POST /v2/users/:id/unpause-account', () => {
  before(() => clean());

  afterEach(() => clean());

  describe('happy path', () => {
    let user: User;
    let dashboardAction: DashboardAction;
    let dashboardActionReason: DashboardActionReason;
    let req: request.Test;

    beforeEach(async () => {
      [user, dashboardAction] = await Promise.all([
        factory.create('subscribed-user'),
        factory.create('dashboard-action', {
          code: ActionCode.ActivateAccount,
        }),
      ]);

      await factory.create('membership-pause', { userId: user.id });

      dashboardActionReason = await factory.create('dashboard-action-reason', {
        dashboardActionId: dashboardAction.id,
        reason: 'user won the lottery',
      });

      req = request(app)
        .post(`/v2/users/${user.id}/unpause-account`)
        .send({
          dashboardActionReasonId: dashboardActionReason.id,
          zendeskTicketUrl: 'pirat.es',
          note: 'but you have heard of me',
        })
        .expect(200);
    });

    it('should update membership_pause', async () => {
      const agent = await createInternalUser();

      await withInternalUser(req, agent);

      const membershipPause = await MembershipPause.findOne({
        where: { userId: user.id },
      });

      expect(membershipPause).to.exist;
      expect(membershipPause.unpausedAt).to.not.be.sameMoment(moment(ACTIVE_TIMESTAMP));
    });

    it('should create action log and join table entry', async () => {
      const agent = await createInternalUser();

      await withInternalUser(req, agent);

      const membershipPause = await MembershipPause.findOne({
        where: { userId: user.id },
      });

      const actionLog = await DashboardActionLog.findOne({
        where: { internalUserId: agent.id, dashboardActionReasonId: dashboardActionReason.id },
      });
      const actionLogUnause = await DashboardActionLogMembershipPause.findOne({
        where: { membershipPauseId: membershipPause.id, dashboardActionLogId: actionLog.id },
      });

      expect(actionLogUnause).to.exist;
      expect(actionLog.internalUserId).to.eq(agent.id);
      expect(actionLog.dashboardActionReasonId).to.eq(dashboardActionReason.id);
      expect(actionLog.zendeskTicketUrl).to.eq('pirat.es');
      expect(actionLog.note).to.eq('but you have heard of me');
    });
  });
});
