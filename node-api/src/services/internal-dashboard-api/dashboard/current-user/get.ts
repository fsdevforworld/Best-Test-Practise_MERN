import { Response } from 'express';
import { IDashboardApiRequest } from '../../../../typings';

export default async function getCurrentUser(req: IDashboardApiRequest, res: Response) {
  const internalUser = req.internalUser;
  const internalRoleNames = await internalUser.getInternalRoleNames();

  res.send({
    email: internalUser.email,
    roles: internalRoleNames,
  });
}
