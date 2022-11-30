import { wrapMetrics } from '../../lib/datadog-statsd';

export const enum ExperimentMetrics {
  BANK_CONNECTION_SOURCE_USER_NOT_BUCKETED = 'bank_connection_source_experiment.did_not_bucket_user',
  BANK_CONNECTION_SOURCE_USER_BUCKETED = 'bank_connection_source_experiment.bucketed_user',
  COLLECT_NO_OVERDRAFT_ACCOUNT_BUCKETED = 'collect_no_overdraft_account.user_bucketed',
  TABAPAY_AVS_USER_BUCKETED = 'tabapay.avs.user_bucketed',
}

export const metrics = wrapMetrics<ExperimentMetrics>();
