import * as Bluebird from 'bluebird';
import { RateLimiter } from '../../../lib/rate-limiter';
import { EASTERN_TIMEZONE, moment } from '@dave-inc/time-lib';
import { dogstatsd } from '../../../lib/datadog-statsd';
import * as config from 'config';

Bluebird.config({
  cancellation: true,
});

const limiterRatio: number = config.get('plaid.balanceCheckLimiterRatio');
const limiterPrefix: number = config.get('plaid.balanceCheckLimiterPrefix');

const getBalanceRateLimiter = new RateLimiter(`${limiterPrefix}-plaid-get-balance`, [
  { interval: 1, limit: Math.round(20 * limiterRatio), precision: 1 },
]);

const increasedBalanceRateLimiter = new RateLimiter(
  `${limiterPrefix}-plaid-get-balance-increased`,
  [{ interval: 1, limit: Math.round(30 * limiterRatio), precision: 1 }],
);

export function getRateLimiter() {
  const estTime = moment.tz(EASTERN_TIMEZONE);

  // we get increased rate limits from 1am to 7am EST on friday.
  if (estTime.hour() >= 1 && estTime.hour() < 7 && estTime.day() === 5) {
    return increasedBalanceRateLimiter;
  }

  return getBalanceRateLimiter;
}

export function checkRateLimitAndWait(maxWaitTimeSeconds: number): Bluebird<boolean> {
  const startTime = moment();
  return new Bluebird<boolean>(async (res, rej, onCancel) => {
    let cancelled = false;
    onCancel(() => {
      res(true);
      cancelled = true;
    });
    let wasLimited = false;
    while (moment().diff(startTime, 'seconds') < maxWaitTimeSeconds) {
      if (cancelled) {
        return;
      }
      const isLimited = await getRateLimiter().isRateLimited();
      if (isLimited) {
        await Bluebird.delay(1000);

        if (!wasLimited) {
          wasLimited = true;
          dogstatsd.increment('plaid.get_balance.rate_limit.hit');
        }
      } else {
        return res(false);
      }
    }

    return res(true);
  });
}
