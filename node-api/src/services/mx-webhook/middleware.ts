import * as config from 'config';
import { NextFunction, Request, Response } from 'express';

import { InvalidCredentialsError, UnauthorizedError } from '../../lib/error';

async function validateBasicAuth(req: Request, res: Response, next: NextFunction) {
  const authorization = req.get('authorization');
  if (!authorization) {
    throw new InvalidCredentialsError();
  }

  const base64Token = authorization.split('Basic')[1] || '';

  const expectedUsername = config.get<string>('mxAtrium.webhookBasicAuth.username');
  const expectedPassword = config.get<string>('mxAtrium.webhookBasicAuth.password');

  const [username, password] = Buffer.from(base64Token, 'base64')
    .toString()
    .split(':');

  if (username !== expectedUsername || password !== expectedPassword) {
    throw new UnauthorizedError();
  }

  return next();
}

export { validateBasicAuth };
