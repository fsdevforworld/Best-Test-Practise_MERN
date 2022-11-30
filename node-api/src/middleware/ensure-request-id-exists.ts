import { IDaveRequest } from '../typings';
import { Response, NextFunction } from 'express';
import * as uuid from 'uuid/v4';
import logger from '../lib/logger';
import { isProdEnv } from '../lib/utils';

export function ensureRequestIdExistsMiddleware(
  req: IDaveRequest,
  _res: Response,
  next: NextFunction,
): void {
  const requestId = req.get('X-Request-Id');
  if (requestId) {
    req.requestID = requestId;
  } else {
    const generatedRequestId = uuid();
    if (isProdEnv()) {
      logger.debug(
        `Missing 'X-Request-Id' Header! Using a generated one (${generatedRequestId}) instead. [PATH:${req.path}, METHOD: ${req.method}, IP: ${req.ip}]`,
      );
    }
    req.requestID = generatedRequestId;
  }
  next();
}

export default ensureRequestIdExistsMiddleware;
