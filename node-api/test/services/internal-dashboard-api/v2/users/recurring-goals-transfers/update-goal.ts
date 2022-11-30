import { expect } from 'chai';
import { GoalsApi } from '@dave-inc/banking-goals-internal-api-client';
import * as request from 'supertest';
import { clean, replayHttp, withInternalUser } from '../../../../../test-helpers';
import factory from '../../../../../factories';
import {
  DashboardActionLog,
  DashboardActionReason,
  DashboardRecurringGoalsTransferModification,
  User,
} from '../../../../../../src/models';
import { ActionCode } from '../../../../../../src/services/internal-dashboard-api/domain/action-log';
import { generateClient } from '../../../../../../src/services/internal-dashboard-api/domain/goals';
import app from '../../../../../../src/services/internal-dashboard-api';

const fixturePath =
  'services/internal-dashboard-api/v2/users/recurring-goals-transfers/update-goals';

describe('PATCH /v2/users/:userId/recurring-goals-transfers/goal', () => {
  let user: User;
  let dashboardAction;
  let dashboardActionReason: DashboardActionReason;
  let req: request.Test;
  let client: GoalsApi;

  const transferId = 'fd60bfe0924f11eb8b9a2f31cdd60fe8';
  const currentGoalId = 'bdb6314059ec11ebb6b9fbdaaa3455fa';
  const nextGoalId = '8814390059ed11ebb6b9fbdaaa3455fa';

  beforeEach(
    replayHttp(`${fixturePath}/before-each.json`, async () => {
      await clean();

      user = await factory.create<User>('user', { id: 3680 });

      client = generateClient(user.id);

      await client.updateRecurringGoalTransfer(transferId, { goalId: currentGoalId });

      dashboardAction = await factory.create('dashboard-action', {
        code: ActionCode.RecurringGoalsTransferChangeGoal,
      });

      dashboardActionReason = await factory.create('dashboard-action-reason', {
        dashboardActionId: dashboardAction.id,
      });

      req = request(app).patch(`/v2/users/${user.id}/recurring-goals-transfers/${transferId}/goal`);
    }),
  );

  it(
    'updates the goal',
    replayHttp(`${fixturePath}/success.json`, async () => {
      await withInternalUser(
        req
          .send({
            goalId: nextGoalId,
            dashboardActionReasonId: dashboardActionReason.id,
            zendeskTicketUrl: 'foo',
          })
          .expect(204),
      );

      const { data } = await client.getRecurringGoalTransfers();

      const updatedTransfer = data.recurringGoalTransfers.find(
        t => t.recurringTransferId === transferId,
      );

      expect(updatedTransfer.goalId).to.equal(nextGoalId);
    }),
  );

  it(
    'creates an action log and modification',
    replayHttp(`${fixturePath}/success.json`, async () => {
      const note = 'my note';
      const zendeskTicketUrl = 'foo';

      await withInternalUser(
        req
          .send({
            goalId: nextGoalId,
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

      const modification = await DashboardRecurringGoalsTransferModification.findOne({
        where: { dashboardActionLogId: actionLog.id },
      });

      expect(modification).to.exist;
      expect(modification.modification).to.deep.equal({
        goalId: {
          previousValue: currentGoalId,
          currentValue: nextGoalId,
        },
      });
    }),
  );

  it(
    'requires a reason that belongs to the correct action code',
    replayHttp(`${fixturePath}/success.json`, async () => {
      const otherReason = await factory.create('dashboard-action-reason');

      await withInternalUser(
        req
          .send({
            goalId: nextGoalId,
            zendeskTicketUrl: 'foo',
            dashboardActionReasonId: otherReason.id,
          })
          .expect(400),
      );
    }),
  );

  it(
    'requires a goalId',
    replayHttp(`${fixturePath}/success.json`, async () => {
      await withInternalUser(
        req
          .send({
            dashboardActionReasonId: dashboardActionReason.id,
            zendeskTicketUrl: 'foo',
          })
          .expect(400),
      );
    }),
  );
});
