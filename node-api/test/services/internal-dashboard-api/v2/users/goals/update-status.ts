import { expect } from 'chai';
import { GoalsApi } from '@dave-inc/banking-goals-internal-api-client';
import * as request from 'supertest';
import { clean, replayHttp, withInternalUser } from '../../../../../test-helpers';
import factory from '../../../../../factories';
import {
  DashboardActionLog,
  DashboardActionReason,
  DashboardGoalModification,
  User,
} from '../../../../../../src/models';
import { ActionCode } from '../../../../../../src/services/internal-dashboard-api/domain/action-log';
import { generateClient } from '../../../../../../src/services/internal-dashboard-api/domain/goals';
import app from '../../../../../../src/services/internal-dashboard-api';

const fixturePath = 'services/internal-dashboard-api/v2/users/goals/update-status';

describe('PATCH /v2/users/:userId/goals/:goalId/status', () => {
  let user: User;
  let dashboardAction;
  let dashboardActionReason: DashboardActionReason;
  let req: request.Test;
  let client: GoalsApi;

  // Find a goal that is not 'closed' (i.e. canceled or completed) if you want to rerecord
  const goalId = '00f07410deb411ebab7db5b19361694e';
  const userId = 3366265;

  beforeEach(async () => {
    await clean();

    user = await factory.create<User>('user', { id: userId });

    client = generateClient(user.id);

    dashboardAction = await factory.create('dashboard-action', {
      code: ActionCode.UpdateGoalStatus,
    });

    dashboardActionReason = await factory.create('dashboard-action-reason', {
      dashboardActionId: dashboardAction.id,
    });

    req = request(app).patch(`/v2/users/${user.id}/goals/${goalId}/status`);
  });

  it(
    'updates the goal - canceled',
    replayHttp(`${fixturePath}/cancel-success.json`, async () => {
      await withInternalUser(
        req
          .send({
            status: 'canceled',
            dashboardActionReasonId: dashboardActionReason.id,
            zendeskTicketUrl: 'foo',
          })
          .expect(204),
      );

      const { data } = await client.getGoal(goalId);

      expect(data.status).to.equal('canceled');
    }),
  );

  it(
    'creates an action log and modification',
    replayHttp(`${fixturePath}/cancel-success.json`, async () => {
      const note = 'my note';
      const zendeskTicketUrl = 'foo';

      await withInternalUser(
        req
          .send({
            status: 'canceled',
            dashboardActionReasonId: dashboardActionReason.id,
            zendeskTicketUrl,
            note,
          })
          .expect(204),
      );

      const actionLog = await DashboardActionLog.findOne({
        where: { dashboardActionReasonId: dashboardActionReason.id },
      });

      expect(actionLog.note).to.equal(note);
      expect(actionLog.zendeskTicketUrl).to.equal(zendeskTicketUrl);

      const modification = await DashboardGoalModification.findOne({
        where: { dashboardActionLogId: actionLog.id },
      });

      expect(modification).to.exist;
      expect(modification.modification).to.deep.equal({
        status: {
          previousValue: 'active',
          currentValue: 'canceled',
        },
      });
    }),
  );

  it('requires a reason that belongs to the correct action code', async () => {
    const otherReason = await factory.create('dashboard-action-reason');

    await withInternalUser(
      req
        .send({
          status: 'canceled',
          zendeskTicketUrl: 'foo',
          dashboardActionReasonId: otherReason.id,
        })
        .expect(400),
    );
  });

  it('throws if status is not "canceled" or "completed"', async () => {
    await withInternalUser(
      req
        .send({
          status: 'open',
          zendeskTicketUrl: 'foo',
          dashboardActionReasonId: dashboardActionReason.id,
        })
        .expect(400),
    );
  });
});
