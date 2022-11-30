import { DashboardAction, Reimbursement } from '../../../../models';
import { IActionLogResource } from './serialize-action-log';
import { serializeDate } from '../../../../serialization';
import serialize from '../serialize';

const serializeRefundLegacyActionLog: serialize<Reimbursement, IActionLogResource> = async (
  refund: Reimbursement,
) => {
  const internalUser = refund.reimburser || (await refund.getReimburser());

  const dashboardAction = await DashboardAction.findOne({
    where: {
      code: 'refund-subscription',
    },
  });

  return {
    // we don't want any id collisions with actionLog.id in the UI's actionLogState
    id: `legacy-refund-action-${refund.id}`,
    type: `action-log`,
    attributes: {
      created: serializeDate(refund.created),
      dashboardActionId: dashboardAction?.id,
      dashboardActionName: dashboardAction?.name,
      dashboardActionCode: dashboardAction?.code,
      dashboardActionReasonId: null,
      dashboardActionReasonName: refund.reason,
      note: refund.extra?.note,
      zendeskTicketUrl: refund.zendeskTicketId,
      internalUserId: internalUser?.id,
      internalUserEmail: internalUser?.email,
    },
  };
};

export default serializeRefundLegacyActionLog;
