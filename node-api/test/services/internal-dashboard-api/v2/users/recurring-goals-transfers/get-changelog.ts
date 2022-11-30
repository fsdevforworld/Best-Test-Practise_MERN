import * as request from 'supertest';
import { clean, withInternalUser } from '../../../../../test-helpers';
import factory from '../../../../../factories';
import { InternalUser, User } from '../../../../../../src/models';
import { ActionCode } from '../../../../../../src/services/internal-dashboard-api/domain/action-log';
import app from '../../../../../../src/services/internal-dashboard-api';
import * as sinon from 'sinon';
import * as goalsDomain from '../../../../../../src/services/internal-dashboard-api/domain/goals';
import { serializeDate } from '../../../../../../src/serialization';
import { expect } from 'chai';
import IModificationDetail from '../../../serializers/changelog/i-modification-detail';

const sandbox = sinon.createSandbox();

describe('GET /v2/users/:id/recurring-goals-transfers/:id/changelog', () => {
  before(() => clean(sandbox));
  afterEach(() => clean(sandbox));

  let user: User;
  let internalUser: InternalUser;
  let req: request.Test;
  let getGoalsStub: sinon.SinonStub;

  const transferId = '1';

  beforeEach(async () => {
    await clean(sandbox);

    getGoalsStub = sandbox.stub();
    sandbox.stub(goalsDomain, 'generateClient').returns({
      getGoals: getGoalsStub,
    });

    user = await factory.create('user');
    internalUser = await factory.create('internal-user');

    req = request(app)
      .get(`/v2/users/${user.id}/recurring-goals-transfers/${transferId}/changelog`)
      .expect(200);
  });

  it('returns changelog entries with goal name instead of goal id', async () => {
    const dashboardAction = await factory.create('dashboard-action', {
      code: ActionCode.RecurringGoalsTransferChangeGoal,
    });
    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      dashboardActionId: dashboardAction.id,
    });
    const dashboardActionLog = await factory.create('dashboard-action-log', {
      dashboardActionReasonId: dashboardActionReason.id,
      internalUserId: internalUser.id,
    });

    await factory.create('dashboard-recurring-goals-transfer-modification', {
      userId: user.id,
      dashboardActionLogId: dashboardActionLog.id,
      recurringGoalsTransferId: transferId,
      modification: {
        goalId: {
          previousValue: '1',
          currentValue: '2',
        },
      },
    });

    getGoalsStub.returns({
      data: {
        goals: [
          { id: '1', name: 'My super old goal' },
          { id: '2', name: 'My super new goal' },
        ],
      },
    });

    const {
      body: { data },
    } = await withInternalUser(req);

    const details = [
      {
        type: 'modification',
        attributes: {
          name: 'goal',
          previousValue: 'My super old goal',
          currentValue: 'My super new goal',
          dataType: 'string',
        },
      },
      {
        type: 'action-log',
        attributes: {
          reason: dashboardActionReason.reason,
          internalUserEmail: internalUser.email,
          created: serializeDate(dashboardActionLog.created),
          note: dashboardActionLog.note,
          zendeskTicketUrl: dashboardActionLog.zendeskTicketUrl,
        },
      },
    ];

    const [serializedModification] = data;

    expect(serializedModification.attributes.details).to.deep.equal(details);
  });

  it('serializes transfer cancellations', async () => {
    const deleted = '2021-01-01';

    const dashboardAction = await factory.create('dashboard-action', {
      code: ActionCode.CancelRecurringGoalsTransfer,
    });
    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      dashboardActionId: dashboardAction.id,
    });
    const dashboardActionLog = await factory.create('dashboard-action-log', {
      dashboardActionReasonId: dashboardActionReason.id,
      internalUserId: internalUser.id,
    });

    await factory.create('dashboard-recurring-goals-transfer-modification', {
      userId: user.id,
      dashboardActionLogId: dashboardActionLog.id,
      recurringGoalsTransferId: transferId,
      modification: {
        deleted: {
          previousValue: null,
          currentValue: deleted,
        },
      },
    });

    getGoalsStub.returns({ data: {} });

    const {
      body: { data },
    } = await withInternalUser(req);

    const modificationDetail: IModificationDetail = {
      type: 'modification',
      attributes: {
        name: 'deleted',
        previousValue: null,
        currentValue: deleted,
        dataType: 'date',
      },
    };

    const details = [
      modificationDetail,
      {
        type: 'action-log',
        attributes: {
          reason: dashboardActionReason.reason,
          internalUserEmail: internalUser.email,
          created: serializeDate(dashboardActionLog.created),
          note: dashboardActionLog.note,
          zendeskTicketUrl: dashboardActionLog.zendeskTicketUrl,
        },
      },
    ];

    const [serializedModification] = data;

    expect(serializedModification.attributes.details).to.deep.equal(details);
  });
});
