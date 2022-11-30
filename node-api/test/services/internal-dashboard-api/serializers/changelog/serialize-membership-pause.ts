import { expect } from 'chai';
import { moment } from '@dave-inc/time-lib';
import { clean } from '../../../../test-helpers';
import factory from '../../../../factories';

import { changelogSerializers } from '../../../../../src/services/internal-dashboard-api/serializers';
import { ActionCode } from '../../../../../src/services/internal-dashboard-api/domain/action-log';
import {
  DashboardAction,
  DashboardActionLogMembershipPause,
  MembershipPause,
} from '../../../../../src/models';

const { serializeMembershipPause } = changelogSerializers;

describe('serializeMembershipPause', () => {
  before(() => clean());

  afterEach(() => clean());

  it('has the correct status for the entries', async () => {
    const membershipPause = await factory.create<MembershipPause>('membership-pause', {
      pausedAt: moment('2020-12-01'),
    });

    const [pausedResponse] = await serializeMembershipPause(membershipPause);
    expect(pausedResponse.attributes.status).to.equal('PAUSED');

    await membershipPause.update({ pausedAt: moment().add(1, 'week') });
    const [upcomingResponse] = await serializeMembershipPause(membershipPause);
    expect(upcomingResponse.attributes.status).to.equal('UPCOMING PAUSE');

    await membershipPause.update({ unpausedAt: moment().subtract(1, 'month') });
    const [activeResponse, canceledResponse] = await serializeMembershipPause(membershipPause);
    expect(activeResponse.attributes.status).to.equal('ACTIVE');
    expect(canceledResponse.attributes.status).to.equal('PAUSE CANCELED');
  });

  it('includes related action logs', async () => {
    const membershipPause = await factory.create<MembershipPause>('membership-pause', {
      pausedAt: moment('2020-12-01'),
      unpausedAt: moment().subtract(1, 'day'),
    });

    const [pauseAction, unpauseAction] = await Promise.all([
      factory.create<DashboardAction>('dashboard-action', { code: ActionCode.PauseAccount }),
      factory.create<DashboardAction>('dashboard-action', { code: ActionCode.ActivateAccount }),
    ]);

    const [pauseReason, unpauseReason] = await Promise.all([
      factory.create('dashboard-action-reason', { dashboardActionId: pauseAction.id }),
      factory.create('dashboard-action-reason', { dashboardActionId: unpauseAction.id }),
    ]);

    const [pauseActionLog, unpauseActionLog] = await Promise.all([
      factory.create('dashboard-action-log', { dashboardActionReasonId: pauseReason.id }),
      factory.create('dashboard-action-log', { dashboardActionReasonId: unpauseReason.id }),
    ]);

    await Promise.all([
      DashboardActionLogMembershipPause.create({
        membershipPauseId: membershipPause.id,
        dashboardActionLogId: pauseActionLog.id,
      }),
      DashboardActionLogMembershipPause.create({
        membershipPauseId: membershipPause.id,
        dashboardActionLogId: unpauseActionLog.id,
      }),
    ]);

    const [activeResponse, canceledResponse] = await serializeMembershipPause(membershipPause);

    expect(activeResponse.attributes.details.some(detail => detail.type === 'action-log')).to.equal(
      true,
      'should include action log in unpaused entry',
    );

    expect(
      canceledResponse.attributes.details.some(detail => detail.type === 'action-log'),
    ).to.equal(true, 'should include action log in paused entry');
  });
});
