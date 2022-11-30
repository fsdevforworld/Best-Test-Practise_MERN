import * as config from 'config';
import * as crypto from 'crypto';
import { NextFunction, Response } from 'express';
import { UnauthorizedError } from '../lib/error';
import { IDaveRequest } from '../typings';

export const AUTHORIZATION_HEADER = 'Authorization';
export const CLIENT_ID_HEADER = 'X-Client-ID';

const internalAuthConfig = config.get<{
  clientId: string;
  secret: string;
}>('internal-auth');

// authentication middleware
export default async function(req: IDaveRequest, res: Response, next: NextFunction) {
  if (req.method === 'OPTIONS') {
    return next();
  }

  // check for basic auth header
  if (!req.headers.authorization) {
    return next(new UnauthorizedError(`Authorization header is missing`));
  }

  // verify auth credentials
  const base64Credentials = req.headers.authorization.split(' ')[1];

  if (!base64Credentials) {
    return next(new UnauthorizedError('Authorization header not formatted correctly'));
  }

  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
  const [clientId, clientSecret] = credentials.split(':');

  const hashSecret = crypto
    .createHash('sha256')
    .update(clientSecret)
    .digest('hex');

  // Hash secret and see if it matches
  if (clientId !== internalAuthConfig.clientId || hashSecret !== internalAuthConfig.secret) {
    return next(new UnauthorizedError('Client Id or secret does not match'));
  }

  next();
}
