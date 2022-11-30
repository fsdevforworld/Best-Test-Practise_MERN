import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { User } from '../../../../models';
import { generateClient, getAccount, getGoals } from '../../domain/goals';
import { serializeMany, goalsSerializers } from '../../serializers';

async function getGoalsAccount(
  req: IDashboardApiResourceRequest<User>,
  res: IDashboardV2Response<goalsSerializers.IGoalAccountResource>,
) {
  const { resource: user } = req;

  const client = generateClient(user.id);

  const [account, goals] = await Promise.all([getAccount(client), getGoals(client)]);

  if (!account) {
    return res.send({
      data: null,
    });
  }

  const [data, included] = await Promise.all([
    goalsSerializers.serializeGoalAccount(account, {
      goals: goals.map(goal => ({ id: goal.id, type: 'goal' })),
    }),
    serializeMany(goals, goalsSerializers.serializeGoal),
  ]);

  res.send({
    data,
    included,
  });
}

export default getGoalsAccount;
