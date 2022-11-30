import { DashboardAction, DashboardActionReason } from '../../../../models';
import { IApiResourceObject } from '../../../../typings';
import { serializeDate } from '../../../../serialization';
import serialize from '../serialize';

interface IDashboardActionReasonResource extends IApiResourceObject {
  type: 'dashboard-action-reason';
  attributes: {
    created: string;
    actionId: string;
    actionCode: string;
    reason: string;
    isActive: boolean;
    noteRequired: boolean;
    updated: string;
  };
}

const serializeDashboardActionReason: serialize<
  DashboardActionReason,
  IDashboardActionReasonResource
> = async (dashboardActionReason: DashboardActionReason) => {
  if (!dashboardActionReason.dashboardAction) {
    await dashboardActionReason.reload({ include: [DashboardAction] });
  }

  const { dashboardAction } = dashboardActionReason;

  return {
    id: `${dashboardActionReason.id}`,
    type: `dashboard-action-reason`,
    attributes: {
      created: serializeDate(dashboardActionReason.created),
      actionId: `${dashboardAction.id}`,
      actionCode: dashboardAction.code,
      reason: dashboardActionReason.reason,
      isActive: dashboardActionReason.isActive,
      noteRequired: dashboardActionReason.noteRequired,
      updated: serializeDate(dashboardActionReason.updated),
    },
  };
};

export { IDashboardActionReasonResource };
export default serializeDashboardActionReason;
