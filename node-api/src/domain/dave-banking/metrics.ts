import { wrapMetrics } from '../../lib/datadog-statsd';

export const enum DaveBankingMetrics {
  CLOSE_DAVE_BANKING_ACCOUNT_FAILED = 'dave_banking.close_dave_banking_account.failed',
  CLOSE_DAVE_BANKING_ACCOUNT_SUCCEEDED = 'dave_banking.close_dave_banking_account.succeeded',
  DETECT_FIRST_RECURRING_PAYCHECK_FAILED = 'dave_banking.detect_first_recurring_paycheck.failed',
  DETECT_FIRST_RECURRING_PAYCHECK_SUCCEEDED = 'dave_banking.detect_first_recurring_paycheck.succeeded',
}

export const metrics = wrapMetrics<DaveBankingMetrics>();
