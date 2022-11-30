import { GoalsApi, IApiGoalAccount } from '@dave-inc/banking-goals-internal-api-client';

async function getAccount(client: GoalsApi): Promise<IApiGoalAccount> {
  let account: IApiGoalAccount;

  const { data } = await client.getGoalAccount();
  account = data.goalAccount;

  return account;
}

export default getAccount;
