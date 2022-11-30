import { StandardResponse } from '@dave-inc/wire-typings';
import { IDaveResourceRequest, IDaveResponse } from '../../typings';

import { moment } from '@dave-inc/time-lib';

import { User } from '../../models';

export async function getUser(
  req: IDaveResourceRequest<User>,
  res: IDaveResponse<StandardResponse>,
) {
  const { id, deleted, fraud } = req.resource;
  const user = { id, deleted: moment(deleted) <= moment(), fraud: !!fraud };

  const serializedResponse = {
    ok: true,
    user,
  };

  return res.send(serializedResponse);
}
