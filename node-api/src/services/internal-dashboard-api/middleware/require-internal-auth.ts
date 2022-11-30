import { Response, NextFunction, Request } from 'express';
import getUserFromOauthToken from '../domain/get-user-from-oauth-token';
import { MissingHeadersError, UnauthorizedError } from '../../../lib/error';
import { IDashboardApiRequest } from '../../../typings';

export default async function requireInternalAuth(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'OPTIONS') {
    return next();
  }

  const token = req.get('Authorization');

  if (!token) {
    return next(
      new MissingHeadersError(null, {
        required: ['authorization'],
        provided: Object.keys(req.headers),
      }),
    );
  }

  const internalUser = await getUserFromOauthToken(token).catch(ex => next(ex));

  if (!internalUser) {
    return next(new UnauthorizedError(`User does not have permission`));
  }

  (req as IDashboardApiRequest).internalUser = internalUser;

  next();
}
