import { Response, NextFunction } from 'express';
import { UnauthorizedError } from '../../../../lib/error';
import { IDashboardApiRequest } from '../../../../typings';
import { InternalRoleName } from '../../../../models/internal-role';

export default async function requireInternalRole(
  allowedRoles: InternalRoleName[],
  req: IDashboardApiRequest,
  res: Response,
  next: NextFunction,
) {
  if (req.method === 'OPTIONS') {
    return next();
  }

  const internalRoleNames = await req.internalUser.getInternalRoleNames();
  const hasAtLeastOneMatch = internalRoleNames.some(role => allowedRoles.includes(role));

  if (!hasAtLeastOneMatch) {
    return next(new UnauthorizedError(`User does not have permission`));
  }

  return next();
}
