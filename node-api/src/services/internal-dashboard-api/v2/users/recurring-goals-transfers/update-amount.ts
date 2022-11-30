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

async function updateAmount(
  req: IDashboardApiResourceRequest<User, ActionLogPayload & { amount: number }>,
  res: IDashboardV2Response,
) {
  const {
    resource: user,
    internalUser,
    params: { recurringTransferId },
    body: { amount, dashboardActionReasonId, zendeskTicketUrl, note },
  } = req;

  if (amount <= 0) {
    throw new InvalidParametersError('Amount must be greater than $0');
  }

  await validateActionLog(
    dashboardActionReasonId,
    ActionCode.RecurringGoalsTransferChangeAmount,
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

  const { amount: currentAmount } = recurringTransfer;

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
      amount,
    },
  );

  await modification.update({
    modification: {
      amount: {
        previousValue: currentAmount,
        currentValue: updatedRecurringTransfer.amount,
      },
    },
  });

  res.sendStatus(204);
}

export default updateAmount;
