import { GoalsApi, IApiGoal } from '@dave-inc/banking-goals-internal-api-client';

async function getGoals(client: GoalsApi): Promise<IApiGoal[]> {
  let goals: IApiGoal[];

  try {
    const { data } = await client.getGoals();
    goals = data.goals;
  } catch (err) {
    if (err?.response?.status === 403) {
      goals = [];
    } else {
      throw err;
    }
  }

  return goals;
}

export default getGoals;
