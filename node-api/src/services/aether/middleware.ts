import { Response, NextFunction } from 'express';
import { get } from 'lodash';
import { FindOptions } from 'sequelize';
import { Model } from 'sequelize-typescript';

import { NotFoundError, InvalidParametersError } from '../../lib/error';
import { IDaveResourceRequest } from '../../typings';

type ResourceFinder<T> = (identifier?: number | string, options?: FindOptions) => Promise<T>;

export function findResourceOr404<T extends Model<T>>(finder: ResourceFinder<T>, idRoute: string) {
  return async (req: IDaveResourceRequest<T>, _res: Response, next: NextFunction) => {
    const resourceId: string = get(req, idRoute);

    if (!resourceId) {
      return next(new InvalidParametersError('Could not find resource at specified path'));
    }

    const resource = await finder(resourceId);
    if (!resource) {
      return next(new NotFoundError());
    }

    req.resource = resource;
    next();
  };
}
