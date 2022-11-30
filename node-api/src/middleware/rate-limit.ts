import { IDaveRequest } from '../typings';
import { Response, NextFunction } from 'express';
import { RateLimiter } from '../lib/rate-limiter';

import { dogstatsd } from '../lib/datadog-statsd';
import { GeneralServerError } from '../lib/error';

export default function createMiddleware(
  limitRules: Array<{
    limit: number;
    interval: number;
  }>,
) {
  return async (req: IDaveRequest, res: Response, next: NextFunction) => {
    const rateLimiter = new RateLimiter(req.baseUrl, limitRules);
    const isRateLimited = await rateLimiter.isRateLimited(req.baseUrl);

    if (isRateLimited) {
      dogstatsd.event('Overall endpoint rate limit hit', req.baseUrl, { alert_type: 'warning' });
      throw new GeneralServerError('Something went wrong. Please try again');
    }

    next();
  };
}
