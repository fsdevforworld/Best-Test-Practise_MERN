import { IDashboardApiRequest } from '../../../../typings';
import { Response } from 'express';
import getClient from '../../../../../src/domain/bank-of-dave-internal-api';

const BankingInternalApiClient = getClient();

async function user(req: IDashboardApiRequest, res: Response): Promise<Response> {
  const userId = parseInt(req.params.id, 10);
  const response = await BankingInternalApiClient.getUser(userId);
  return res.send(response?.data);
}

export default {
  user,
};
