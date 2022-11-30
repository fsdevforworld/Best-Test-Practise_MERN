import { IDaveRequest } from '../typings';
import { Response, NextFunction } from 'express';

import { dogstatsd } from '../lib/datadog-statsd';
import { InvalidParametersError } from '../lib/error';
import { minVersionCheckFromRequest } from '../lib/utils';

export enum MinVersionType {
  ERROR = 'error',
  FALLBACK = 'fallback',
}

export default function createMiddleware(
  version: string,
  type: MinVersionType,
  options?: {
    error?: {
      message: string;
      metric?: string;
      customCode?: number;
    };
  },
) {
  return async (req: IDaveRequest, res: Response, next: NextFunction) => {
    const hasMinVersion = minVersionCheckFromRequest(req, version);

    // FALLBACK: fallback to next route
    if (type === MinVersionType.FALLBACK && !hasMinVersion) {
      next('route');
      return;
    }

    // ERROR: throw error with message, otherwise look for next route.
    if (type === MinVersionType.ERROR && !hasMinVersion) {
      const { message, metric, customCode } = options.error;
      if (metric) {
        dogstatsd.increment(metric);
      }
      if (customCode) {
        throw new InvalidParametersError(message, { customCode });
      }
      throw new InvalidParametersError(message);
    }

    next();
  };
}
