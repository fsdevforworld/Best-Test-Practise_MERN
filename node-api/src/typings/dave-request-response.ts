import { Request, Response } from 'express';
import { User } from '../models';

export interface IDaveRequest<T = any> extends Request {
  user: User;
  requestID?: string;
  userToken: string;
  usedSessionCache: boolean;
  file: Express.Multer.File;
  errorCount: number;
  body: T;
}

export interface IDaveResourceRequest<T> extends IDaveRequest {
  resource: T;
}

export interface IDaveResponse<T> extends Response {
  send(body?: T): Response;
  json(body: T): Response;
}
