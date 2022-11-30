import { Request, Response } from 'express';
import { InternalUser } from '../models';

interface IDashboardApiRequest<T = unknown> extends Request {
  internalUser: InternalUser;
  body: T;
}

interface IDashboardApiResourceRequest<R, T = unknown> extends IDashboardApiRequest<T> {
  resource: R;
}

interface IDashboardV2Response<
  PrimaryData = IApiResourceObject | IApiResourceObject[],
  IncludedData = IApiResourceObject
> extends Response {
  send(body: { data: PrimaryData; included?: IncludedData[] } | number): Response;
}

interface IApiRelationshipData {
  id: string;
  type: string;
}

interface IApiToOneRelationshipObject {
  data: IApiRelationshipData;
}

interface IApiToManyRelationshipObject {
  data: IApiRelationshipData[];
}

interface IApiRelationshipObjects {
  [type: string]: IApiToOneRelationshipObject | IApiToManyRelationshipObject;
}

interface IRawRelationships {
  [key: string]: IApiResourceObject | IApiResourceObject[];
}

interface IApiResourceObject {
  type: string;
  id: string;
  attributes?: {
    [key: string]: any;
  };
  relationships?: IApiRelationshipObjects;
}

export {
  IApiRelationshipData,
  IApiRelationshipObjects,
  IApiResourceObject,
  IApiToOneRelationshipObject,
  IApiToManyRelationshipObject,
  IDashboardApiRequest,
  IDashboardApiResourceRequest,
  IDashboardV2Response,
  IRawRelationships,
};
