import * as config from 'config';

import { dogstatsd } from '../../../lib/datadog-statsd';
import { RateLimitError } from '../../../lib/error';
import { RateLimiter } from '../../../lib/rate-limiter';
import { BooleanValue } from '../../../typings';
import { isDevEnv, isStagingEnv, isTestEnv } from '../../../lib/utils';

export type RateLimitValues = {
  phoneNumber?: string;
  email?: string;
  deviceId: string;
  userId?: string;
  ip?: string;
};

type RateLimitRule = {
  interval: number;
  limit: number;
  precision?: number;
};

export const VPN_IP = config.get<string>('dave.vpn.ip');

export const loginRateLimitKey = 'login-with-credentials';
export const loginRateLimitRules = [
  { interval: 60, limit: 5, precision: 10 },
  { interval: 3600, limit: 20, precision: 60 },
];

export const passwordRecoveryRateLimitRules = [
  { interval: 60, limit: 3, precision: 10 },
  { interval: 3600, limit: 10, precision: 60 },
];

export function createRateLimiter(prefix: string, rules: RateLimitRule[]): RateLimiter {
  return new RateLimiter(prefix, rules);
}

function getKeyValue(prefix: string, key: string) {
  return `${prefix}:${key}`;
}

export async function checkRateLimit({
  rateLimiter,
  rateLimitValues,
  prefix,
  errorMessage,
  ip,
}: {
  rateLimiter: RateLimiter;
  rateLimitValues: RateLimitValues;
  prefix: string;
  errorMessage: string;
  ip: string;
}) {
  const isVPN = ip === VPN_IP;
  const rateLimitFromConfig = config.get<boolean | string>('skipRateLimit');
  const notProdEnv = isStagingEnv() || isDevEnv() || isTestEnv();
  const skipRateLimit = (isVPN && notProdEnv) || rateLimitFromConfig;
  if (skipRateLimit === true || skipRateLimit === BooleanValue.True) {
    return;
  }
  let hitRateLimit = false;
  for (const limiter of Object.values(rateLimitValues)) {
    if (!hitRateLimit && limiter) {
      const key = getKeyValue(prefix, limiter);
      hitRateLimit = await rateLimiter.isRateLimited(key);
    }
  }
  if (hitRateLimit) {
    dogstatsd.increment(`rate_limit_error.${prefix.split('-').join('_')}`);
    throw new RateLimitError(errorMessage, {
      showUuid: false,
    });
  }
}

export async function getRemainingLoginAttemptsFromDeviceId(
  rateLimitValues: RateLimitValues,
  prefix: string,
) {
  const deviceIdKey = getKeyValue(prefix, rateLimitValues.deviceId);
  const loginRateLimiter = createRateLimiter(prefix, loginRateLimitRules);
  const remaining = await loginRateLimiter.getAttemptsRemaining(deviceIdKey);
  return remaining.find(({ interval, attemptsLeft }) => {
    return interval === 60;
  }).attemptsLeft;
}
