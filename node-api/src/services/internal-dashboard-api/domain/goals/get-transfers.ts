import { GoalsApi, IApiGoalTransfer } from '@dave-inc/banking-goals-internal-api-client';
import performRequest from './perform-request';

async function getTransfers(client: GoalsApi, goalId: string): Promise<IApiGoalTransfer[]> {
  let transfers: IApiGoalTransfer[];

  const data = await performRequest(client.getGoalTransfers(goalId));
  transfers = data?.goalTransfers || [];

  return transfers;
}

export default getTransfers;
