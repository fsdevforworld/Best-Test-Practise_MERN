import { moment } from '@dave-inc/time-lib';
import { Response } from 'express';
import * as config from 'config';
import * as jwt from 'jwt-simple';

import { IDaveRequest } from '../../../../typings';

export const secret = config.get<string>('braze.sdkAuthentication');
export async function getBrazeAuthToken(req: IDaveRequest, res: Response) {
  const exp = moment()
    .add(1, 'hour')
    .unix();
  const sub = req.user.id;
  const token = jwt.encode({ sub, exp }, secret, 'RS256');
  return res.send({ token });
}
