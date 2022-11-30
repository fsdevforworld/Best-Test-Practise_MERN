import {
  DashboardActionLog,
  DashboardAction,
  DashboardActionReason,
  DashboardBulkUpdate,
  InternalUser,
} from '../../../../models';
import { IApiResourceObject } from '../../../../typings';
import { serializeDate } from '../../../../serialization';
import serializeRelationships from '../serialize-relationships';
import serialize from '../serialize';
import { DashboardBulkUpdateExtra } from '../../domain/dashboard-bulk-update/dashboard-bulk-update-typings';

interface IDashboardBulkUpdateResource extends IApiResourceObject {
  type: 'dashboard-bulk-update';
  attributes: {
    name: string;
    actionName: string;
    inputFileUrl: string;
    inputFileRowCount: number;
    dashboardActionLogId: number;
    outputFileUrl: string;
    status: string;
    createdBy: string;
    created: string;
    updated: string;
    extra: DashboardBulkUpdateExtra;
  };
}

function getActionName(actionLog: DashboardActionLog) {
  // strips out bulk update from column name
  return actionLog.dashboardActionReason.dashboardAction.name.replace(/\s*bulk\s*update\s*/gi, '');
}

const serializeDashboardBulkUpdate: serialize<
  DashboardBulkUpdate,
  IDashboardBulkUpdateResource
> = async (dashboardBulkUpdate: DashboardBulkUpdate, relationships) => {
  const actionLog = await dashboardBulkUpdate.getDashboardActionLog({
    include: [
      {
        model: DashboardActionReason,
        include: [DashboardAction],
      },
      InternalUser,
    ],
  });

  return {
    id: `${dashboardBulkUpdate.id}`,
    type: `dashboard-bulk-update`,
    attributes: {
      name: dashboardBulkUpdate.name,
      actionName: getActionName(actionLog),
      inputFileUrl: dashboardBulkUpdate.inputFileUrl,
      inputFileRowCount: dashboardBulkUpdate.inputFileRowCount,
      dashboardActionLogId: dashboardBulkUpdate.dashboardActionLogId,
      outputFileUrl: dashboardBulkUpdate.outputFileUrl,
      status: dashboardBulkUpdate.status,
      createdBy: actionLog.internalUser.email,
      created: serializeDate(dashboardBulkUpdate.created),
      updated: serializeDate(dashboardBulkUpdate.updated),
      extra: dashboardBulkUpdate.extra,
    },
    relationships: serializeRelationships(relationships),
  };
};

export { IDashboardBulkUpdateResource };
export default serializeDashboardBulkUpdate;
