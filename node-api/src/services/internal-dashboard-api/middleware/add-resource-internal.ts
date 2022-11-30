import * as Bluebird from 'bluebird';
import { Response, NextFunction } from 'express';
import { IDashboardApiResourceRequest } from '../../../typings';
import { Model } from 'sequelize-typescript';
import { NotFoundError, InvalidParametersError } from '../../../lib/error';
import { get } from 'lodash';
import { FindOptions } from 'sequelize';
/*
 * This middleware allows us to add a `resource` of a specific type to any request
 * The resource will be an instance of one of our Sequelize models, e.g. a user.
 * Within this function, ResourceType and T both mean the same thing: the type of the resource.
 * T is checked/used at compile time, and ResourceType is used at runtime.
 * to use this function, place the following before the route handler in the route middleware:
 * addResource<User>(User, 'params.userId', { paranoid: true });
 * This will fetch the User using the ID string at `req.params.userId`
 * if it is not found, a 404 Not Found error will be thrown
 * The first argument to your controller (the request) should be of type IDashboardApiResourceRequest<User>
 * and you'll now have access to `req.resource` which is an instance of a User.
 */

type ResourceFinder<R> = {
  findByPk(identifier?: number | string, options?: FindOptions): Bluebird<R>;
};

type AddResourceOptions = {
  idRoute?: string;
  paranoid?: boolean;
};

export default function addResourceInternal<R extends Model<R>>(
  ResourceType: ResourceFinder<R>,
  options: AddResourceOptions = {},
) {
  const { idRoute = 'params.id', paranoid = false } = options;

  return async (req: IDashboardApiResourceRequest<R>, _res: Response, next: NextFunction) => {
    const resourceId: string = get(req, idRoute);

    if (!resourceId) {
      return next(new InvalidParametersError('Could not find resource at specified path'));
    }

    const resource = await ResourceType.findByPk(resourceId, { paranoid });
    if (!resource) {
      return next(new NotFoundError());
    }

    req.resource = resource;
    next();
  };
}
