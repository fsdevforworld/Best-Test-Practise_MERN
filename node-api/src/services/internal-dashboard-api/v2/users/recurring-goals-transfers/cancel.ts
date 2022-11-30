import {
  User,
  sequelize,
  DashboardActionLog,
  DashboardRecurringGoalsTransferModification,
} from '../../../../../models';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../../typings';
import { ActionCode, ActionLogPayload, validateActionLog } from '../../../domain/action-log';
import { generateClient } from '../../../domain/goals';
import { moment } from '@dave-inc/time-lib';
import { getParams } from '../../../../../lib/utils';

async function cancel(
  req: IDashboardApiResourceRequest<User, ActionLogPayload>,
  res: IDashboardV2Response,
) {
  const {
    resource: user,
    internalUser,
    params: { recurringTransferId },
  } = req;

  const { dashboardActionReasonId, zendeskTicketUrl, note } = getParams(
    req.body,
    ['dashboardActionReasonId', 'zendeskTicketUrl'],
    ['note'],
  );

  await validateActionLog(dashboardActionReasonId, ActionCode.CancelRecurringGoalsTransfer, note);

  const client = generateClient(user.id);

  let modification: DashboardRecurringGoalsTransferModification;

  await sequelize.transaction(async transaction => {
    const dashboardActionLog = await DashboardActionLog.create(
      {
        dashboardActionReasonId,
        internalUserId: internalUser.id,
        zendeskTicketUrl,
        note,
      },
      { transaction },
    );

    modification = await DashboardRecurringGoalsTransferModification.create(
      {
        dashboardActionLogId: dashboardActionLog.id,
        recurringGoalsTransferId: recurringTransferId,
      },
      { transaction },
    );
  });

  await client.cancelRecurringTransfer(recurringTransferId);

  await modification.update({
    modification: {
      deleted: {
        previousValue: null,
        currentValue: moment().format(),
      },
    },
  });

  res.sendStatus(204);
}

export default cancel;
