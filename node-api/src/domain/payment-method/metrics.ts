import { wrapMetrics } from '../../lib/datadog-statsd';

export const enum TabapayPaymentMethodMetrics {
  CREATE_ACCOUNT_DUPLICATE_ACCOUNT_ERROR = 'tabapay.create_account.duplicate_account_error.failed',
  CREATE_ACCOUNT_DUPLICATE_ACCOUNT_ERROR_USER = 'tabapay.create_account.duplicate_account_error.resolved.user_id_match',
  CREATE_ACCOUNT_DUPLICATE_ACCOUNT_ERROR_PHONE = 'tabapay.create_account.duplicate_account_error.resolved.phone_number_match',
  CREATE_ACCOUNT_DUPLICATE_ACCOUNT_ERROR_DELETED_60_DAYS = 'tabapay.create_account.duplicate_account_error.resolved.deleted_60_days',
  CREATE_ACCOUNT_DUPLICATE_ACCOUNT_USERS_DO_NOT_MATCH = 'tabapay.create_account.duplicate_account_error.users_do_not_match',
}

type PaymentMethodMetrics = TabapayPaymentMethodMetrics;

export const metrics = wrapMetrics<PaymentMethodMetrics>();
