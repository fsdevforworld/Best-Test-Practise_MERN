import {
  DashboardActionLog,
  InternalUser,
  DashboardActionReason,
  DashboardAction,
} from '../../../../models';
import { IApiResourceObject } from '../../../../typings';
import { serializeDate } from '../../../../serialization';
import serialize from '../serialize';

interface IActionLogResource extends IApiResourceObject {
  attributes: {
    created: string;
    dashboardActionId: number;
    dashboardActionName: string;
    dashboardActionCode: string;
    dashboardActionReasonName: string;
    dashboardActionReasonId: number;
    note: string;
    zendeskTicketUrl: string;
    internalUserId: number;
    internalUserEmail: string;
  };
}

const serializeActionLog: serialize<DashboardActionLog, IActionLogResource> = async (
  actionLog: DashboardActionLog,
) => {
  await actionLog.reload({
    include: [
      {
        model: DashboardActionReason,
        include: [DashboardAction],
      },
      InternalUser,
    ],
  });

  const actionReason = actionLog.dashboardActionReason;
  const action = actionReason.dashboardAction;

  return {
    id: `${actionLog.id}`,
    type: `action-log`,
    attributes: {
      created: serializeDate(actionLog.created),
      dashboardActionId: action.id,
      dashboardActionName: action.name,
      dashboardActionCode: action.code,
      dashboardActionReasonId: actionReason.id,
      dashboardActionReasonName: actionReason.reason,
      note: actionLog.note,
      zendeskTicketUrl: actionLog.zendeskTicketUrl,
      internalUserId: actionLog.internalUserId,
      internalUserEmail: actionLog.internalUser?.email,
    },
  };
};

export { IActionLogResource };
export default serializeActionLog;
