import { ForbiddenError } from '../lib/error';
import { Response, NextFunction } from 'express';
import { IDaveRequest } from '../typings';

export default async (req: IDaveRequest, res: Response, next: NextFunction): Promise<void> => {
  const isPaused = await req.user.isPaused();
  if (isPaused) {
    return next(
      new ForbiddenError(
        'Your Dave membership is currently paused. Please update your app and unpause your membership to access this feature.',
      ),
    );
  }
  return next();
};
