import { RateLimiter } from '../../../lib/rate-limiter';

// this works out to 80 a minute, synapses limit is 100 but we want to
// use a number lower than that so we don't mess with advance disbursement
export const fetchTransactionDaveUserLimiter = new RateLimiter('synapsepay-get-dave-user', [
  { interval: 60, limit: 80, precision: 60 },
]);
