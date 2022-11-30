import * as config from 'config';
import { RateLimitError } from '../../../lib/error';
import { RateLimiter } from '../../../lib/rate-limiter';
import { dogstatsd } from '../../../lib/datadog-statsd';
import { BooleanValue } from '../../../typings';
import { isDevEnv, isStagingEnv, isTestEnv } from '../../../lib/utils';

export const VPN_IP = config.get<string>('dave.vpn.ip');

function isValidConfig(limitConfig: any): limitConfig is number {
  return Number.isInteger(limitConfig) && limitConfig > 0;
}

export async function checkIpRateLimit(ip: string, errorMessage: string): Promise<void> {
  const isVPN = ip === VPN_IP;
  const notProdEnv = isStagingEnv() || isDevEnv() || isTestEnv();
  const skipRateLimit = (isVPN && notProdEnv) || config.get<boolean | string>('skipRateLimit');
  if (skipRateLimit === true || skipRateLimit === BooleanValue.True) {
    return;
  }

  const limitPerHour = config.get<number>('rateLimits.loginsByIp.perHour');
  if (!isValidConfig(limitPerHour)) {
    throw new Error('Rate limit config is invalid');
  }

  const ipRateLimiter = new RateLimiter('loginsByIp', [
    { interval: 3600, limit: limitPerHour, precision: 60 },
  ]);
  const isRateLimited = await ipRateLimiter.isRateLimited(`loginByIp:${ip}`);

  if (isRateLimited) {
    dogstatsd.event('IP address rate limit hit for login attempts', ip, { alert_type: 'warning' });
    throw new RateLimitError(errorMessage, {
      showUuid: false,
      data: {
        ip,
      },
    });
  }
}
