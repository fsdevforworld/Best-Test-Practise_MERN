import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../../typings';
import { User } from '../../../../../models';
import { goalsSerializers, serializeMany } from '../../../serializers';
import { generateClient, getTransfers } from '../../../domain/goals';

async function getGoalTransfers(
  req: IDashboardApiResourceRequest<User>,
  res: IDashboardV2Response<goalsSerializers.IGoalTransferResource[]>,
) {
  const {
    resource: user,
    params: { goalId },
  } = req;

  const client = generateClient(user.id);

  const transfers = await getTransfers(client, goalId);

  const data = await serializeMany(transfers, goalsSerializers.serializeGoalTransfer);

  res.send({ data });
}

export default getGoalTransfers;
