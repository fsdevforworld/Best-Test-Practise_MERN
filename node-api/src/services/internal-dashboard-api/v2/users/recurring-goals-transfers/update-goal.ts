import { InvalidParametersError, NotFoundError } from '@dave-inc/error-types';
import { isNil } from 'lodash';
import {
  User,
  sequelize,
  DashboardActionLog,
  DashboardRecurringGoalsTransferModification,
} from '../../../../../models';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../../typings';
import { ActionCode, ActionLogPayload, validateActionLog } from '../../../domain/action-log';
import { generateClient, getRecurringTransfers } from '../../../domain/goals';

async function updateGoal(
  req: IDashboardApiResourceRequest<User, ActionLogPayload & { goalId: string }>,
  res: IDashboardV2Response,
) {
  const {
    resource: user,
    internalUser,
    params: { recurringTransferId },
    body: { goalId, dashboardActionReasonId, zendeskTicketUrl, note },
  } = req;

  if (isNil(goalId)) {
    throw new InvalidParametersError('Must include goalId');
  }

  await validateActionLog(
    dashboardActionReasonId,
    ActionCode.RecurringGoalsTransferChangeGoal,
    note,
  );

  const client = generateClient(user.id);
  const recurringTransfers = await getRecurringTransfers(client);
  const recurringTransfer = recurringTransfers.find(
    transfer => transfer.recurringTransferId === recurringTransferId,
  );

  if (isNil(recurringTransfer)) {
    throw new NotFoundError(`Can't find recurring goals transfer`);
  }

  const { goalId: currentGoalId } = recurringTransfer;

  if (currentGoalId === goalId) {
    return res.sendStatus(204);
  }

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

  const { data: updatedRecurringTransfer } = await client.updateRecurringGoalTransfer(
    recurringTransferId,
    {
      goalId,
    },
  );

  await modification.update({
    modification: {
      goalId: {
        previousValue: currentGoalId,
        currentValue: updatedRecurringTransfer.goalId,
      },
    },
  });

  res.sendStatus(204);
}

export default updateGoal;
