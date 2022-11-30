import { getParams } from '../../../../lib/utils';
import { User } from '../../../../models';
import { IDashboardApiResourceRequest, IDaveResponse } from '../../../../typings';
import { ActionCode, ActionLogPayload, validateActionLog } from '../../domain/action-log';
import { validateCoolOffWaive } from '../../../../domain/user-updates';
import { update } from '../../domain/user';

async function waiveCoolOffPeriod(
  req: IDashboardApiResourceRequest<User, ActionLogPayload>,
  res: IDaveResponse<number>,
) {
  const user = req.resource;
  const internalUserId = req.internalUser.id;
  const { dashboardActionReasonId, zendeskTicketUrl, note } = getParams(
    req.body,
    ['dashboardActionReasonId', 'zendeskTicketUrl'],
    ['note'],
  );

  await Promise.all([
    validateCoolOffWaive(user),
    validateActionLog(dashboardActionReasonId, ActionCode.CoolOffPeriodWaive, note),
  ]);

  await update(
    user,
    { overrideSixtyDayDelete: true },
    {
      dashboardActionReasonId,
      internalUserId,
      zendeskTicketUrl,
      note,
    },
  );

  return res.sendStatus(204);
}

export default waiveCoolOffPeriod;
