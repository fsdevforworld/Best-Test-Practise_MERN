import { DashboardActionLog } from '../../../../models';
import { serializeDate } from '../../../../serialization';
import IActionLogDetail from './i-action-log-detail';

async function serializeActionLogDetail(actionLog: DashboardActionLog): Promise<IActionLogDetail> {
  const [actionReason, internalUser] = await Promise.all([
    actionLog.dashboardActionReason || actionLog.getDashboardActionReason(),
    actionLog.internalUser || actionLog.getInternalUser(),
  ]);

  return {
    type: 'action-log',
    attributes: {
      reason: actionReason.reason,
      internalUserEmail: internalUser.email,
      created: serializeDate(actionLog.created),
      note: actionLog.note,
      zendeskTicketUrl: actionLog.zendeskTicketUrl,
    },
  };
}

export default serializeActionLogDetail;
