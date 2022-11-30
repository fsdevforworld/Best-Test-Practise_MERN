import { DashboardActionLog } from '../../../../models';
import { serializeDate } from '../../../../serialization';
import serialize from '../serialize';
import serializeRelationships from '../serialize-relationships';
import IDashboardActionLogResource from './i-dashboard-action-log-resource';

const serializer: serialize<
  DashboardActionLog,
  IDashboardActionLogResource
> = async function serializeDashboardActionLog(actionLog, relationships) {
  const [actionReason, internalUser] = await Promise.all([
    actionLog.dashboardActionReason || actionLog.getDashboardActionReason(),
    actionLog.internalUser || actionLog.getInternalUser(),
  ]);

  return {
    id: `${actionLog.id}`,
    type: 'dashboard-action-log',
    attributes: {
      reason: actionReason.reason,
      internalUserEmail: internalUser.email,
      created: serializeDate(actionLog.created),
      note: actionLog.note || null,
      zendeskTicketUrl: actionLog.zendeskTicketUrl || null,
    },
    relationships: serializeRelationships(relationships),
  };
};

export default serializer;
