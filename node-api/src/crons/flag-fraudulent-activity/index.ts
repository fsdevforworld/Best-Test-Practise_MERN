import * as config from 'config';
import { Cron, DaveCron } from '../cron';
import logger from '../../lib/logger';
import { moment } from '@dave-inc/time-lib';
import { FraudAlertReason } from '../../typings';
import FraudHelper from './common';
import OneTimePayment from './one-time-payments';

export async function run() {
  logger.info('starting flag-fraudulent-activity job');

  const highOneTimePaymentCounts = OneTimePayment.queryOneTimePaymentCount(
    config.get('fraud.heuristics.oneTimePayment.maxPayments') as number,
    config.get('fraud.heuristics.oneTimePayment.timeWindowDays') as number,
    moment(),
  );
  await FraudHelper.flagEventCountViolations(
    highOneTimePaymentCounts,
    FraudAlertReason.TooManyOneTimePayments,
  );

  const highOneTimePaymentAttemptCounts = OneTimePayment.queryOneTimePaymentAttemptCount(
    config.get('fraud.heuristics.oneTimePaymentAttempts.maxAttempts'),
    config.get('fraud.heuristics.oneTimePaymentAttempts.timeWindowDays'),
    moment(),
  );
  await FraudHelper.flagEventCountViolations(
    highOneTimePaymentAttemptCounts,
    FraudAlertReason.TooManyOneTimePaymentAttempts,
  );

  logger.info('completed flag-fraudulent-activity job');
}

export const FlagFraudulentActivity: Cron = {
  name: DaveCron.FlagFraudulentActivity,
  process: run,
  schedule: '0 7 * * *',
};
