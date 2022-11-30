import { IDashboardApiRequest } from '../../../typings';
import { Response } from 'express';
import plaidDown from '../../../helper/plaid-down';

async function showPlaidDownScreen(req: IDashboardApiRequest, res: Response): Promise<Response> {
  await plaidDown.showPlaidDownScreen();
  return res.sendStatus(200);
}

async function hidePlaidDownAndSendNotifications(
  req: IDashboardApiRequest,
  res: Response,
): Promise<Response> {
  const results = await plaidDown.hidePlaidDownAndSendNotifications();
  return res.send(results);
}

export default {
  showPlaidDownScreen,
  hidePlaidDownAndSendNotifications,
};
