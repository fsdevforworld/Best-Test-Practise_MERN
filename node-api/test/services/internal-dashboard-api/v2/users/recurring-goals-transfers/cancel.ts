import { expect } from 'chai';
import * as request from 'supertest';
import { clean, withInternalUser } from '../../../../../test-helpers';
import factory from '../../../../../factories';
import {
  DashboardActionLog,
  DashboardActionReason,
  DashboardRecurringGoalsTransferModification,
  User,
} from '../../../../../../src/models';
import { ActionCode } from '../../../../../../src/services/internal-dashboard-api/domain/action-log';
import app from '../../../../../../src/services/internal-dashboard-api';
import * as sinon from 'sinon';
import * as goalsDomain from '../../../../../../src/services/internal-dashboard-api/domain/goals';
import { NotFoundError } from '@dave-inc/error-types';

const sandbox = sinon.createSandbox();

describe('POST /v2/users/:userId/recurring-goals-transfers/:transferId/cancel', () => {
  before(() => clean(sandbox));
  afterEach(() => clean(sandbox));

  let user: User;
  let dashboardAction;
  let dashboardActionReason: DashboardActionReason;
  let req: request.Test;
  let cancelTransferStub: sinon.SinonStub;

  const transferId = 'fd60bfe0924f11eb8b9a2f31cdd60fe8';

  beforeEach(async () => {
    await clean(sandbox);

    cancelTransferStub = sandbox.stub();
    sandbox.stub(goalsDomain, 'generateClient').returns({
      cancelRecurringTransfer: cancelTransferStub,
    });

    user = await factory.create<User>('user', { id: 3680 });

    dashboardAction = await factory.create('dashboard-action', {
      code: ActionCode.CancelRecurringGoalsTransfer,
    });

    dashboardActionReason = await factory.create('dashboard-action-reason', {
      dashboardActionId: dashboardAction.id,
    });

    req = request(app).post(`/v2/users/${user.id}/recurring-goals-transfers/${transferId}/cancel`);
  });

  it('updates the goal', async () => {
    cancelTransferStub.returns({});

    await withInternalUser(
      req
        .send({
          dashboardActionReasonId: dashboardActionReason.id,
          zendeskTicketUrl: 'foo',
          note: 'bar',
        })
        .expect(204),
    );

    expect(cancelTransferStub).to.be.calledOnce;
  });

  it('creates a modification', async () => {
    cancelTransferStub.returns({});

    await withInternalUser(
      req
        .send({
          dashboardActionReasonId: dashboardActionReason.id,
          zendeskTicketUrl: 'foo',
          note: 'bar',
        })
        .expect(204),
    );

    const actionLog = await DashboardActionLog.findOne({
      where: { dashboardActionReasonId: dashboardActionReason.id },
    });

    expect(actionLog.note).to.equal('bar');
    expect(actionLog.zendeskTicketUrl).to.equal('foo');

    const modification = await DashboardRecurringGoalsTransferModification.findOne({
      where: { dashboardActionLogId: actionLog.id },
    });

    expect(modification).to.exist;
    expect(modification.recurringGoalsTransferId).to.equal(transferId);
    const { previousValue, currentValue } = modification.modification.deleted;
    expect(previousValue).to.be.null;
    expect(currentValue).to.be.a('string');
  });

  it('Throws a 400 when the dashboard action reason does not match the action', async () => {
    cancelTransferStub.returns({});

    const incorrectReason = await factory.create('dashboard-action-reason');

    const response = await withInternalUser(
      req
        .send({
          dashboardActionReasonId: incorrectReason.id,
          zendeskTicketUrl: 'foo',
          note: 'bar',
        })
        .expect(400),
    );

    expect(response.body.message).to.contain(
      `Dashboard action reason provided does not correspond to the "${ActionCode.CancelRecurringGoalsTransfer}" dashboard action`,
    );
  });

  it('Throws a 400 when the transfer does not belong to the user', async () => {
    cancelTransferStub.throwsException(new NotFoundError('Recurring transfer not found'));

    const response = await withInternalUser(
      req
        .send({
          dashboardActionReasonId: dashboardActionReason.id,
          zendeskTicketUrl: 'foo',
          note: 'bar',
        })
        .expect(404),
    );

    expect(response.body.message).to.contain('Recurring transfer not found');
  });
});
