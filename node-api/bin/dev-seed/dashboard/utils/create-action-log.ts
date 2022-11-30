import { DashboardAction, DashboardActionLog, DashboardActionReason } from '../../../../src/models';
import factory from '../../../../test/factories';
import { ActionCode } from '../../../../src/services/internal-dashboard-api/domain/action-log';

import findOrCreateAgent from './find-or-create-agent';

async function createActionLog(
  options: {
    internalUserEmail?: string;
    code?: ActionCode;
    reason?: string;
  } = {},
) {
  const { internalUserEmail, code, reason } = options;

  const internalUser = await findOrCreateAgent(internalUserEmail);

  const action = code
    ? await DashboardAction.findOne({ where: { code }, rejectOnEmpty: true })
    : await factory.create<DashboardAction>('dashboard-action');

  const actionReason = reason
    ? await DashboardActionReason.findOne({
        where: { dashboardActionId: action.id, reason },
        rejectOnEmpty: true,
      })
    : await factory.create<DashboardActionReason>('dashboard-action-reason', {
        dashboardActionId: action.id,
      });

  const actionLog = await factory.create<DashboardActionLog>('dashboard-action-log', {
    dashboardActionReasonId: actionReason.id,
    internalUserId: internalUser.id,
  });

  return actionLog;
}

export default createActionLog;
