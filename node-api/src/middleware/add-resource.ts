import * as Bluebird from 'bluebird';
import { Response, NextFunction } from 'express';
import { IDaveResourceRequest } from '../typings';
import { Model } from 'sequelize-typescript';
import { NotFoundError, InvalidParametersError } from '../lib/error';
import { get } from 'lodash';
import { FindOptions } from 'sequelize';
/*
 * This middleware allows us to add a `resource` of a specific type to any request
 * The resource will be an instance of one of our Sequelize models, e.g. a payment method.
 * Within this function, ResourceType and T both mean the same thing: the type of the resource.
 * T is checked/used at compile time, and ResourceType is used at runtime.
 * to use this function, place the following after requireAuth in the route middleware:
 * addResource<PaymentMethod>(PaymentMethod, 'params.paymentMethodId');
 * This will fetch the Payment Method using the ID string at `req.params.paymentMethod`
 * if it is not found or the user ID does not match the authorized user, a 404 Not Found error will be thrown
 * The first argument to your controller (the request) should be of type IDaveResourceRequest<PaymentMethod>
 * and you'll now have access to `req.resource` which is an instance of a PaymentMethod.
 */

type ResourceFinder<T> = {
  findByPk(identifier?: number | string, options?: FindOptions): Bluebird<T>;
};

export default function<T extends Model<T>>(ResourceType: ResourceFinder<T>, idRoute: string) {
  return async (req: IDaveResourceRequest<T>, res: Response, next: NextFunction) => {
    const resourceId: string = get(req, idRoute);

    if (!resourceId) {
      return next(new InvalidParametersError('Could not find resource at specified path'));
    }

    const resource = await ResourceType.findByPk(resourceId);
    if (!resource) {
      return next(new NotFoundError());
    }
    if (resource.get('userId') !== req.user.id) {
      return next(new InvalidParametersError('Could not find resource at specified path'));
    }

    req.resource = resource;
    next();
  };
}
