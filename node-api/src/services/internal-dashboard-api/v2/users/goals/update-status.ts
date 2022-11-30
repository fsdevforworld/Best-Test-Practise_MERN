import { ApiUpdateGoalStatus } from '@dave-inc/banking-goals-internal-api-client/dist/generated/lib/models/api-update-goal-status';
import { InvalidParametersError } from '@dave-inc/error-types';
import {
  User,
  sequelize,
  DashboardActionLog,
  DashboardGoalModification,
} from '../../../../../models';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../../typings';
import { ActionCode, ActionLogPayload, validateActionLog } from '../../../domain/action-log';
import { generateClient } from '../../../domain/goals';

interface IPayload extends ActionLogPayload {
  status: ApiUpdateGoalStatus;
}

async function updateStatus(
  req: IDashboardApiResourceRequest<User, IPayload>,
  res: IDashboardV2Response,
) {
  const {
    resource: user,
    internalUser,
    params: { goalId },
    body: { status, dashboardActionReasonId, zendeskTicketUrl, note },
  } = req;

  if (!Object.values(ApiUpdateGoalStatus).includes(status)) {
    throw new InvalidParametersError(
      `Invalid status: ${status}. Status must be ${ApiUpdateGoalStatus.Completed} or ${ApiUpdateGoalStatus.Canceled}`,
    );
  }

  await validateActionLog(dashboardActionReasonId, ActionCode.UpdateGoalStatus, note);

  const client = generateClient(user.id);

  const { data: currentGoal } = await client.getGoal(goalId);

  let modification: DashboardGoalModification;

  await sequelize.transaction(async transaction => {
    const { id: dashboardActionLogId } = await DashboardActionLog.create(
      {
        dashboardActionReasonId,
        internalUserId: internalUser.id,
        zendeskTicketUrl,
        note,
      },
      { transaction },
    );

    modification = await DashboardGoalModification.create(
      {
        dashboardActionLogId,
        goalId,
      },
      { transaction },
    );
  });

  const { data: updatedGoal } = await client.updateGoal(goalId, { status });

  await modification.update({
    modification: {
      status: {
        previousValue: currentGoal.status,
        currentValue: updatedGoal.status,
      },
    },
  });

  res.sendStatus(204);
}

export default updateStatus;
