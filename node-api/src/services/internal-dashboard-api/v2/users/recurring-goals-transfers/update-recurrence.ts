import { IRecurrenceInterval } from '@dave-inc/banking-goals-internal-api-client';
import { NotFoundError } from '@dave-inc/error-types';
import { isEqual, isNil } from 'lodash';
import {
  User,
  sequelize,
  DashboardActionLog,
  DashboardRecurringGoalsTransferModification,
} from '../../../../../models';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../../typings';
import { ActionCode, ActionLogPayload, validateActionLog } from '../../../domain/action-log';
import { generateClient, getRecurringTransfers } from '../../../domain/goals';

interface IPayload extends ActionLogPayload {
  interval: IRecurrenceInterval;
  intervalParams: Array<string | number>;
}

async function updateRecurrence(
  req: IDashboardApiResourceRequest<User, IPayload>,
  res: IDashboardV2Response,
) {
  const {
    resource: user,
    internalUser,
    params: { recurringTransferId },
    body: { interval, intervalParams, dashboardActionReasonId, zendeskTicketUrl, note },
  } = req;

  await validateActionLog(
    dashboardActionReasonId,
    ActionCode.RecurringGoalsTransferChangeRecurrence,
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

  const {
    recurrence: { interval: currentInterval, intervalParams: currentIntervalParams },
  } = recurringTransfer;

  if (interval === currentInterval && isEqual(intervalParams, currentIntervalParams)) {
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

  await client.updateRecurringGoalTransfer(recurringTransferId, {
    recurrence: {
      interval,
      intervalParams,
    },
  });

  await modification.update({
    modification: {
      interval: {
        previousValue: currentInterval,
        currentValue: interval,
      },
      intervalParams: {
        previousValue: currentIntervalParams.join(','),
        currentValue: intervalParams.join(','),
      },
    },
  });

  res.sendStatus(204);
}

export default updateRecurrence;
