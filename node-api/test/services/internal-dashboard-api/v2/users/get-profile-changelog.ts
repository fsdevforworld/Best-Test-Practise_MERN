import * as request from 'supertest';
import { expect } from 'chai';
import { DashboardActionLog, DashboardUserModification } from '../../../../../src/models';
import factory from '../../../../factories';
import { clean, withInternalUser } from '../../../../test-helpers';
import app from '../../../../../src/services/internal-dashboard-api';
import { serializeDate } from '../../../../../src/serialization';
import { ActionCode } from '../../../../../src/services/internal-dashboard-api/domain/action-log';

describe('GET /v2/users/:id/profile-changelog', () => {
  before(() => clean());

  afterEach(() => clean());

  it('responds with only user modifications', async () => {
    const [user, internalUser, action, otherAction] = await Promise.all([
      factory.create('user'),
      factory.create('internal-user'),
      factory.create('dashboard-action', {
        code: ActionCode.UserFirstNameChange,
      }),
      factory.create('dashboard-action', {
        code: ActionCode.CoolOffPeriodWaive,
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

    const [unloadedActionLog, otherActionLog] = await Promise.all([
      factory.create('dashboard-action-log', {
        dashboardActionReasonId: reason.id,
        internalUserId: internalUser.id,
      }),
      factory.create('dashboard-action-log', {
        dashboardActionReasonId: otherReason.id,
        internalUserId: internalUser.id,
      }),
    ]);

    const [unloadedModification] = await Promise.all([
      factory.create('dashboard-user-modification', {
        userId: user.id,
        dashboardActionLogId: unloadedActionLog.id,
        modification: {
          firstName: {
            previousValue: 'Paris',
            currentValue: 'Paras',
          },
        },
      }),
      factory.create('dashboard-user-modification', {
        userId: user.id,
        dashboardActionLogId: otherActionLog.id,
        modification: {},
      }),
    ]);

    const actionLog = await DashboardActionLog.scope('withRelated').findByPk(unloadedActionLog.id);
    const modification = await DashboardUserModification.scope('withDashboardAction').findByPk(
      unloadedModification.id,
    );

    const {
      body: { data },
    } = await withInternalUser(request(app).get(`/v2/users/${user.id}/profile-changelog`));

    expect(data).to.have.length(1);

    const [response] = data;

    const details = [
      {
        type: 'modification',
        attributes: {
          name: 'firstName',
          previousValue: modification.modification.firstName.previousValue,
          currentValue: modification.modification.firstName.currentValue,
          dataType: 'string',
        },
      },
      {
        type: 'action-log',
        attributes: {
          reason: reason.reason,
          internalUserEmail: internalUser.email,
          created: serializeDate(actionLog.created),
          note: actionLog.note,
          zendeskTicketUrl: actionLog.zendeskTicketUrl,
        },
      },
    ];

    expect(response.id).to.equal(`user-mod-${modification.id}`);
    expect(response.type).to.equal('changelog-entry');
    expect(response.attributes).to.deep.equal({
      title: action.name,
      initiator: 'agent',
      occurredAt: serializeDate(modification.created),
      details,
    });
  });

  it('responds with email verifications', async () => {
    const internalUser = await factory.create('internal-user');

    const [emailVerification, actionLog] = await Promise.all([
      factory.create('email-verification'),
      factory.create('dashboard-action-log', {
        internalUserId: internalUser.id,
      }),
    ]);

    await factory.create('dashboard-action-log-email-verification', {
      emailVerificationId: emailVerification.id,
      dashboardActionLogId: actionLog.id,
    });

    const actionReason = await actionLog.getDashboardActionReason();
    const action = await actionReason.getDashboardAction();

    const {
      body: { data },
    } = await withInternalUser(
      request(app).get(`/v2/users/${emailVerification.userId}/profile-changelog`),
    );

    expect(data.length).to.equal(1);

    const [response] = data;
    const details = [
      {
        type: 'field',
        attributes: {
          name: 'unverifiedEmail',
          value: emailVerification.email,
          dataType: 'string',
        },
      },
      {
        type: 'action-log',
        attributes: {
          reason: actionReason.reason,
          internalUserEmail: internalUser.email,
          created: serializeDate(actionLog.created),
          note: actionLog.note,
          zendeskTicketUrl: actionLog.zendeskTicketUrl,
        },
      },
    ];

    expect(response.id).to.equal(`email-verification-${emailVerification.id}`);
    expect(response.type).to.equal('changelog-entry');
    expect(response.attributes).to.deep.equal({
      title: action.name,
      initiator: 'agent',
      occurredAt: serializeDate(emailVerification.created),
      details,
    });
  });
});
