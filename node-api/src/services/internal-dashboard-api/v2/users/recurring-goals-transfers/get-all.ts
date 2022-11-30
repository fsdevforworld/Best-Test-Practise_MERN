import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../../typings';
import { User } from '../../../../../models';
import { goalsSerializers } from '../../../serializers';
import * as Bluebird from 'bluebird';
import { generateClient, getFundingSource, getRecurringTransfers } from '../../../domain/goals';

async function getAll(
  req: IDashboardApiResourceRequest<User>,
  res: IDashboardV2Response<goalsSerializers.IRecurringTransferResource[]>,
) {
  const { resource: user } = req;

  const client = generateClient(user.id);

  const recurringTransfers = await getRecurringTransfers(client);

  const data = await Bluebird.map(recurringTransfers, async transfer => {
    const { targetAccountId, transferType } = transfer;
    const { fundingSourceId, fundingSourceType } = await getFundingSource(
      targetAccountId,
      transferType,
    );

    const fundingSource = fundingSourceId ? { type: fundingSourceType, id: fundingSourceId } : null;
    const goal = { type: 'goal', id: transfer.goalId };

    return goalsSerializers.serializeRecurringTransfer(transfer, { fundingSource, goal });
  });

  res.send({ data });
}

export default getAll;
