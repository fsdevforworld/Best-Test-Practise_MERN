import { DashboardAction, DashboardActionReason } from '../../src/models';
import factory from '../factories';
import { ActionCode } from '../../src/services/internal-dashboard-api/domain/action-log';

async function seedDashboardAction(code: ActionCode) {
  const dashboardAction = await factory.create<DashboardAction>('dashboard-action', { code });
  const dashboardActionReason = await factory.create<DashboardActionReason>(
    'dashboard-action-reason',
    {
      dashboardActionId: dashboardAction.id,
    },
  );

  return { dashboardAction, dashboardActionReason };
}

export default seedDashboardAction;
