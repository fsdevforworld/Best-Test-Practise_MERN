import { Request, Response } from 'express';
import * as _ from 'lodash';
import { verifyUser, getCheckingAccountInfo, getCheckingAccountTransactions } from './helpers';

import { IBankingDirectRequest, IDaveResponse } from '../../typings';
import { StandardResponse } from '@dave-inc/wire-typings';

async function ping(req: Request, res: IDaveResponse<StandardResponse>) {
  return res.send({ ok: true });
}

async function authenticate(req: Request, res: Response) {
  const { username, password } = req.body;

  const { authToken, userId } = await verifyUser(username, password);

  return res.send({
    auth_token: authToken,
    user_id: userId,
  });
}

async function getUser(req: IBankingDirectRequest, res: Response): Promise<Response> {
  const response = await getCheckingAccountInfo(req.user);
  return res.send(response);
}

async function getUserTransactions(req: IBankingDirectRequest, res: Response): Promise<Response> {
  const response = await getCheckingAccountTransactions(
    req.user,
    _.parseInt(req.query.start),
    _.parseInt(req.query.limit),
    req.query.start_date,
    req.query.end_date,
  );
  return res.send(response);
}

export { ping, authenticate, getUser, getUserTransactions };
