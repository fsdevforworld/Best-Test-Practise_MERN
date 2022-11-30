import { UserAppVersion } from '../../../models';
import { IDashboardApiRequest } from '../../../typings';
import { Response } from 'express';

async function getByUserId(req: IDashboardApiRequest, res: Response) {
  const userId = req.params.userId;

  const userAppVersions = await UserAppVersion.findAll({
    where: { userId },
    order: [['lastSeen', 'DESC']],
  });

  return res.send(userAppVersions);
}

export default {
  getByUserId,
};
