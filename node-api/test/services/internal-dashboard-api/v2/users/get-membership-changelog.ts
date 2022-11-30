import * as request from 'supertest';
import { expect } from 'chai';
import { moment } from '@dave-inc/time-lib';
import factory from '../../../../factories';
import { clean, withInternalUser } from '../../../../test-helpers';
import {
  DashboardUserModification,
  DeleteRequest,
  MembershipPause,
  User,
} from '../../../../../src/models';
import app from '../../../../../src/services/internal-dashboard-api';
import { ActionCode } from '../../../../../src/services/internal-dashboard-api/domain/action-log';

describe('GET /v2/users/:id/membership-changelog', () => {
  before(() => clean());

  afterEach(() => clean());

  it('includes all changes to account status', async () => {
    const user = await factory.create<User>('user', {
      created: moment().subtract(1, 'month'),
      deleted: moment(),
    });

    await factory.create<MembershipPause>('membership-pause', {
      userId: user.id,
      pausedAt: moment().add(1, 'day'),
      created: moment()
        .subtract(2, 'day')
        .toDate(),
    });

    await factory.create<DeleteRequest>('delete-request', {
      userId: user.id,
      created: moment().subtract(1, 'day'),
    });

    await factory.create<DeleteRequest>('delete-request', {
      userId: user.id,
      created: moment()
        .subtract(1, 'day')
        .add(1, 'hour'),
    });

    const action = await factory.create('dashboard-action', {
      code: ActionCode.CoolOffPeriodWaive,
    });
    const actionReason = await factory.create('dashboard-action-reason', {
      dashboardActionId: action.id,
    });
    const actionLog = await factory.create('dashboard-action-log', {
      dashboardActionReasonId: actionReason.id,
    });

    await factory.create<DashboardUserModification>('dashboard-user-modification', {
      userId: user.id,
      dashboardActionLogId: actionLog.id,
    });

    const {
      body: { data },
    } = await withInternalUser(request(app).get(`/v2/users/${user.id}/membership-changelog`));

    expect(data).to.have.length(5, 'incorrect number of entries');
    expect(data[0].attributes.status).to.equal('CLOSED');
    expect(data[1].attributes.status).to.equal('CLOSED');
    expect(data[2].attributes.status).to.equal('CLOSE FAILED');
    expect(data[3].attributes.status).to.equal('UPCOMING PAUSE');
    expect(data[4].attributes.status).to.equal('ACTIVE');
  });

  it('does not include non-membership UserModifications', async () => {
    const user = await factory.create<User>('user', {
      created: moment().subtract(1, 'month'),
      deleted: moment(),
    });

    const [action, otherAction] = await Promise.all([
      factory.create('dashboard-action', {
        code: ActionCode.CoolOffPeriodWaive,
      }),
      factory.create('dashboard-action', {
        code: ActionCode.UserFirstNameChange,
      }),
    ]);

    const [reason, otherReason] = await Promise.all([
      factory.create('dashboard-action-reason', {
        dashboardActionId: action.id,
      }),
      factory.create('dashboard-action-reason', {
        dashboardActionId: otherAction.id,
      }),
    ]);

    const [actionLog, otherActionLog] = await Promise.all([
      factory.create('dashboard-action-log', {
        dashboardActionReasonId: reason.id,
      }),
      factory.create('dashboard-action-log', {
        dashboardActionReasonId: otherReason.id,
      }),
    ]);

    await Promise.all([
      factory.create('dashboard-user-modification', {
        userId: user.id,
        dashboardActionLogId: actionLog.id,
      }),
      factory.create('dashboard-user-modification', {
        userId: user.id,
        dashboardActionLogId: otherActionLog.id,
      }),
    ]);

    const {
      body: { data },
    } = await withInternalUser(request(app).get(`/v2/users/${user.id}/membership-changelog`));

    expect(data).to.have.length(2, 'incorrect number of entries');
  });
});
