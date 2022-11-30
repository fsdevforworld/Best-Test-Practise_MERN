import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../../typings';
import { DashboardRecurringGoalsTransferModification, User } from '../../../../../models';
import { changelogSerializers, serializeMany } from '../../../serializers';
import { serializeModification } from '../../../serializers/changelog';
import { generateClient } from '../../../domain/goals';
import { ActionCode } from '../../../domain/action-log';
import { keyBy } from 'lodash';

async function getChangelog(
  req: IDashboardApiResourceRequest<User>,
  res: IDashboardV2Response<changelogSerializers.IChangelogEntryResource[]>,
) {
  const {
    resource: user,
    params: { recurringTransferId },
  } = req;

  const client = generateClient(user.id);

  let modifications = await DashboardRecurringGoalsTransferModification.scope(
    'withDashboardAction',
  ).findAll({
    where: { recurringGoalsTransferId: recurringTransferId },
  });

  const {
    data: { goals },
  } = await client.getGoals();

  const goalsMap = keyBy(goals, 'id');

  modifications = modifications.map(transferModification => {
    if (
      transferModification.dashboardActionLog.dashboardActionReason.dashboardAction.code ===
      ActionCode.RecurringGoalsTransferChangeGoal
    ) {
      const {
        modification: { goalId },
      } = transferModification;

      const previousGoalId = goalId.previousValue as string;
      const currentGoalId = goalId.currentValue as string;

      transferModification.modification = {
        goal: {
          previousValue: goalsMap[previousGoalId]?.name || previousGoalId,
          currentValue: goalsMap[currentGoalId]?.name || currentGoalId,
        },
      };
    }

    return transferModification;
  });

  const data = await serializeMany(modifications, serializeModification);

  res.send({ data });
}

export default getChangelog;
