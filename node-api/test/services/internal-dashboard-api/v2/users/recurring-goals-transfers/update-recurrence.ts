import { expect } from 'chai';
import { GoalsApi, IRecurrenceInterval } from '@dave-inc/banking-goals-internal-api-client';
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
  'services/internal-dashboard-api/v2/users/recurring-goals-transfers/update-recurrence';

describe('PATCH /v2/users/:userId/recurring-goals-transfers/recurrence', () => {
  let user: User;
  let dashboardAction;
  let dashboardActionReason: DashboardActionReason;
  let req: request.Test;
  let client: GoalsApi;

  const transferId = 'aa6e5e00db9211eba429cb876f0e3424';

  before(() => clean());
  afterEach(() => clean());

  beforeEach(
    replayHttp(`${fixturePath}/before-each.json`, async () => {
      await clean();

      user = await factory.create<User>('user', { id: 3680 });

      client = generateClient(user.id);

      await client.updateRecurringGoalTransfer(transferId, {
        recurrence: { interval: IRecurrenceInterval.Weekly, intervalParams: ['monday'] },
      });

      dashboardAction = await factory.create('dashboard-action', {
        code: ActionCode.RecurringGoalsTransferChangeRecurrence,
      });

      dashboardActionReason = await factory.create('dashboard-action-reason', {
        dashboardActionId: dashboardAction.id,
      });

      req = request(app).patch(
        `/v2/users/${user.id}/recurring-goals-transfers/${transferId}/recurrence`,
      );
    }),
  );

  it(
    'updates the recurrence',
    replayHttp(`${fixturePath}/success.json`, async () => {
      await withInternalUser(
        req
          .send({
            interval: IRecurrenceInterval.Monthly,
            intervalParams: [1],
            dashboardActionReasonId: dashboardActionReason.id,
            zendeskTicketUrl: 'foo',
          })
          .expect(204),
      );

      const { data } = await client.getRecurringGoalTransfers();

      const updatedTransfer = data.recurringGoalTransfers.find(
        t => t.recurringTransferId === transferId,
      );

      expect(updatedTransfer.recurrence.interval).to.equal(IRecurrenceInterval.Monthly);
      expect(updatedTransfer.recurrence.intervalParams).to.deep.eq([1]);
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
            interval: IRecurrenceInterval.Monthly,
            intervalParams: [1],
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
        interval: {
          previousValue: 'weekly',
          currentValue: 'monthly',
        },
        intervalParams: {
          previousValue: 'monday',
          currentValue: '1',
        },
      });
    }),
  );

  it(
    'works when interval is same but params are different',
    replayHttp(`${fixturePath}/same-interval.json`, async () => {
      await withInternalUser(
        req
          .send({
            interval: IRecurrenceInterval.Weekly,
            intervalParams: ['tuesday'],
            dashboardActionReasonId: dashboardActionReason.id,
            zendeskTicketUrl: 'foo',
          })
          .expect(204),
      );

      const { data } = await client.getRecurringGoalTransfers();

      const updatedTransfer = data.recurringGoalTransfers.find(
        t => t.recurringTransferId === transferId,
      );

      expect(updatedTransfer.recurrence.interval).to.equal(IRecurrenceInterval.Weekly);
      expect(updatedTransfer.recurrence.intervalParams).to.deep.eq(['tuesday']);

      const actionLog = await DashboardActionLog.findOne({
        where: { dashboardActionReasonId: dashboardActionReason.id },
      });

      expect(actionLog).to.exist;
    }),
  );

  it(
    'no-ops when interval and params are the same as existing',
    replayHttp(`${fixturePath}/same-interval-and-params.json`, async () => {
      await withInternalUser(
        req
          .send({
            interval: IRecurrenceInterval.Weekly,
            intervalParams: ['monday'],
            dashboardActionReasonId: dashboardActionReason.id,
            zendeskTicketUrl: 'foo',
          })
          .expect(204),
      );

      const actionLog = await DashboardActionLog.findOne({
        where: { dashboardActionReasonId: dashboardActionReason.id },
      });

      expect(actionLog).to.not.exist;
    }),
  );

  it(
    'requires a reason that belongs to the correct action code',
    replayHttp(`${fixturePath}/invalid-reason.json`, async () => {
      const otherReason = await factory.create('dashboard-action-reason');

      await withInternalUser(
        req
          .send({
            interval: IRecurrenceInterval.Weekly,
            intervalParams: ['tuesday'],
            zendeskTicketUrl: 'foo',
            dashboardActionReasonId: otherReason.id,
          })
          .expect(400),
      );
    }),
  );
});
