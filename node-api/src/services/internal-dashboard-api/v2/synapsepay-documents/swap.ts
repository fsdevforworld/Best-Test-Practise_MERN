import { IDashboardApiRequest } from '../../../../typings';
import { Response } from 'express';
import { swapSynapsepayUsers } from '../../../../domain/synapsepay';
import { getParams } from '../../../../lib/utils';

async function swap(
  req: IDashboardApiRequest<{ synapsepayUserIdToClose: string; synapsepayUserIdToOpen: string }>,
  res: Response,
) {
  const { synapsepayUserIdToClose, synapsepayUserIdToOpen } = getParams(req.body, [
    'synapsepayUserIdToClose',
    'synapsepayUserIdToOpen',
  ]);

  await swapSynapsepayUsers(synapsepayUserIdToClose, synapsepayUserIdToOpen);

  return res.send(204);
}

export default swap;
