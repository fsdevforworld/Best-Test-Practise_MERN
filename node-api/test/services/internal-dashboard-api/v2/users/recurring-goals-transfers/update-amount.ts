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
  'services/internal-dashboard-api/v2/users/recurring-goals-transfers/update-amount';

describe('PATCH /v2/users/:userId/recurring-goals-transfers/amount', () => {
  let user: User;
  let dashboardAction;
  let dashboardActionReason: DashboardActionReason;
  let req: request.Test;
  let client: GoalsApi;

  const transferId = '593d42c0853511eba7aa51337c188405';
  const userId = 2015821;

  beforeEach(
    replayHttp(`${fixturePath}/before-each.json`, async () => {
      await clean();

      user = await factory.create<User>('user', { id: userId });

      client = generateClient(user.id);

      await client.updateRecurringGoalTransfer(transferId, { amount: 10 });

      dashboardAction = await factory.create('dashboard-action', {
        code: ActionCode.RecurringGoalsTransferChangeAmount,
      });

      dashboardActionReason = await factory.create('dashboard-action-reason', {
        dashboardActionId: dashboardAction.id,
      });

      req = request(app).patch(
        `/v2/users/${user.id}/recurring-goals-transfers/${transferId}/amount`,
      );
    }),
  );

  it(
    'updates the amount',
    replayHttp(`${fixturePath}/success.json`, async () => {
      await withInternalUser(
        req
          .send({
            amount: 20,
            dashboardActionReasonId: dashboardActionReason.id,
            zendeskTicketUrl: 'foo',
          })
          .expect(204),
      );

      const { data } = await client.getRecurringGoalTransfers();

      const updatedTransfer = data.recurringGoalTransfers.find(
        t => t.recurringTransferId === transferId,
      );

      expect(updatedTransfer.amount).to.equal(20);
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
            amount: 20,
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
        amount: {
          previousValue: 10,
          currentValue: 20,
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
            amount: 20,
            zendeskTicketUrl: 'foo',
            dashboardActionReasonId: otherReason.id,
          })
          .expect(400),
      );
    }),
  );

  it(
    'requires an amount > 0',
    replayHttp(`${fixturePath}/success.json`, async () => {
      await withInternalUser(
        req
          .send({
            amount: 0,
            dashboardActionReasonId: dashboardActionReason.id,
            zendeskTicketUrl: 'foo',
          })
          .expect(400),
      );
    }),
  );
});
