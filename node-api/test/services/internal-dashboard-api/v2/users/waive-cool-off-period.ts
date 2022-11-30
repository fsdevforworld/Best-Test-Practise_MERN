import * as request from 'supertest';
import app from '../../../../../src/services/internal-dashboard-api';
import { expect } from 'chai';
import { clean, createInternalUser, withInternalUser } from '../../../../test-helpers';
import factory from '../../../../factories';
import {
  DashboardAction,
  DashboardActionLog,
  DashboardActionReason,
  DashboardUserModification,
  User,
} from '../../../../../src/models';
import { ActionCode } from '../../../../../src/services/internal-dashboard-api/domain/action-log';
import { moment } from '@dave-inc/time-lib';

describe('POST /v2/users/:id/waive-cool-off-period', () => {
  before(() => clean());

  afterEach(() => clean());

  let dashboardAction: DashboardAction;
  let dashboardActionReason: DashboardActionReason;

  beforeEach(async () => {
    dashboardAction = await factory.create('dashboard-action', {
      code: ActionCode.CoolOffPeriodWaive,
    });

    dashboardActionReason = await factory.create('dashboard-action-reason', {
      dashboardActionId: dashboardAction.id,
      reason: 'made mistake',
    });
  });

  describe('happy path', () => {
    let user: User;
    let req: request.Test;

    beforeEach(async () => {
      user = await factory.create('user', { deleted: moment() });

      req = request(app)
        .post(`/v2/users/${user.id}/waive-cool-off-period`)
        .send({
          dashboardActionReasonId: dashboardActionReason.id,
          zendeskTicketUrl: 'zende.sk',
        })
        .expect(204);
    });

    it('should flip overrideSixtyDayDelete to true', async () => {
      await withInternalUser(req);

      await user.reload({ paranoid: false });

      expect(user.overrideSixtyDayDelete).to.be.true;
    });

    it('should create dashboard action and modification', async () => {
      const agent = await createInternalUser();
      await withInternalUser(req, agent);

      const expectedModification = {
        overrideSixtyDayDelete: {
          previousValue: false,
          currentValue: true,
        },
      };

      const userModification = await DashboardUserModification.findOne({
        where: { userId: user.id },
      });

      expect(userModification).to.exist;
      expect(userModification.modification).to.deep.eq(expectedModification);

      const actionLog = await DashboardActionLog.findByPk(userModification.dashboardActionLogId);

      expect(actionLog.internalUserId).to.eq(agent.id);
      expect(actionLog.zendeskTicketUrl).to.eq('zende.sk');
      expect(actionLog.dashboardActionReasonId).to.eq(dashboardActionReason.id);
    });
  });

  describe('sad path', () => {
    it('should fail if user is not deleted', async () => {
      const user = await factory.create('user');

      const req = request(app)
        .post(`/v2/users/${user.id}/waive-cool-off-period`)
        .send({
          dashboardActionReasonId: dashboardActionReason.id,
          zendeskTicketUrl: 'zende.sk',
        })
        .expect(400);

      const response = await withInternalUser(req);

      expect(response.body.message).to.contain('Cannot waive cool-off period for active user.');
    });

    it('should fail if user cool-off is already waived', async () => {
      const user = await factory.create('user', {
        deleted: moment(),
        overrideSixtyDayDelete: true,
      });

      const req = request(app)
        .post(`/v2/users/${user.id}/waive-cool-off-period`)
        .send({
          dashboardActionReasonId: dashboardActionReason.id,
          zendeskTicketUrl: 'zende.sk',
        })
        .expect(400);

      const response = await withInternalUser(req);

      expect(response.body.message).to.contain("User's cool-off period has already been waived.");
    });

    it("should fail if the user's cool off has already expired", async () => {
      const user = await factory.create('user', {
        deleted: moment().subtract(6, 'months'),
      });

      const req = request(app)
        .post(`/v2/users/${user.id}/waive-cool-off-period`)
        .send({
          dashboardActionReasonId: dashboardActionReason.id,
          zendeskTicketUrl: 'zende.sk',
        })
        .expect(400);

      const response = await withInternalUser(req);

      expect(response.body.message).to.contain("User's cool-off period has already worn off.");
    });
  });
});
