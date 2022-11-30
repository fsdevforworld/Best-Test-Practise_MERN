import {
  GoalsApi,
  IApiScheduledRecurringGoalTransfer,
} from '@dave-inc/banking-goals-internal-api-client';

async function getRecurringTransfers(
  client: GoalsApi,
): Promise<IApiScheduledRecurringGoalTransfer[]> {
  let recurringTransfers: IApiScheduledRecurringGoalTransfer[];

  try {
    const { data } = await client.getRecurringGoalTransfers();
    recurringTransfers = data.recurringGoalTransfers;
  } catch (err) {
    if (err?.response?.status === 403) {
      recurringTransfers = [];
    } else {
      throw err;
    }
  }

  return recurringTransfers;
}

export default getRecurringTransfers;
