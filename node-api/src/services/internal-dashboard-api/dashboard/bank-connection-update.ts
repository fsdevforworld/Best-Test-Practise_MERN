import { BankConnectionUpdate } from '../../../models/warehouse';
import { IDashboardApiRequest } from '../../../typings';
import { Response } from 'express';

async function getByUserId(req: IDashboardApiRequest, res: Response) {
  const userId = req.params.userId;

  const updates = await BankConnectionUpdate.getAllForUser(userId);

  return res.send(updates);
}

export default {
  getByUserId,
};
