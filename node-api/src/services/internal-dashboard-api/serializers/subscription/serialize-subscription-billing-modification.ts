import {
  InternalUser,
  DashboardActionReason,
  DashboardAction,
  DashboardSubscriptionBillingModification,
} from '../../../../models';
import { IApiResourceObject, IDashboardModification } from '../../../../typings';
import { serializeDate } from '../../../../serialization';
import serialize from '../serialize';

interface ISubscriptionBillingModificationResource extends IApiResourceObject {
  attributes: {
    modifiedEntityType: string;
    modifiedEntityId: number;
    dashboardActionLogId: number;
    modification: IDashboardModification;
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

const serializeSubscriptionBillingModification: serialize<
  DashboardSubscriptionBillingModification,
  ISubscriptionBillingModificationResource
> = async (modification: DashboardSubscriptionBillingModification) => {
  const actionLog = await modification.getDashboardActionLog({
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
    id: `${modification.id}`,
    type: `${modification.getModifiedEntityType()}-modification`,
    attributes: {
      modifiedEntityType: modification.getModifiedEntityType(),
      modifiedEntityId: modification.getModifiedEntityId(),
      dashboardActionLogId: actionLog.id,
      modification: modification.modification,
      created: serializeDate(modification.created),
      dashboardActionId: action.id,
      dashboardActionName: action.name,
      dashboardActionCode: action.code,
      dashboardActionReasonName: actionReason.reason,
      dashboardActionReasonId: actionReason.id,
      note: actionLog.note,
      zendeskTicketUrl: actionLog.zendeskTicketUrl,
      internalUserId: actionLog.internalUserId,
      internalUserEmail: actionLog.internalUser.email,
    },
  };
};

export { ISubscriptionBillingModificationResource };
export default serializeSubscriptionBillingModification;
