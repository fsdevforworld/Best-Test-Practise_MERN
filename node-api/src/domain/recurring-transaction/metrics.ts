import { wrapMetrics } from '../../lib/datadog-statsd';

export const enum RecurringTransactionMetrics {
  EXPECTED_TRANSACTION_MATCH_FOUND = 'expected_transaction.matching.found_match',
  EXPECTED_TRANSACTION_MATCH_NO_RECURRING_FOUND = 'expected_transaction.no_verified_recurring_transaction_found',
  EXPECTED_TRANSACTION_MATCH_CLEARED_MISSED_STATUS = 'expected_transaction.matching.cleared_missed_status',
  RECURRING_SCHEDULE_MATCH_FOUND = 'paycheck_detection.found_nmatch',
  DETECT_RECURRING_TRANSACTION_SUCCESS = 'detect_recurring_transactions.success',
  DETECT_RECURRING_TRANSACTION_FAILURE = 'detect_recurring_transactions.failure',
  VALIDATION_SUCCESS = 'recurring_transaction.validation.success',
  VALIDATION_FAILURE = 'recurring_transaction.validation.failure',
  MARK_MISSED = 'recurring_transactions_mark_missed',
  MARK_MISSED_CHECKED = 'recurring_transactions_mark_missed.checked',
  MARK_MISSED_MISSED = 'recurring_transactions_mark_missed.missed',
  MARK_MISSED_NAME_CHANGED = 'recurring_transactions_mark_missed.name_changed',
  MARK_MISSED_ERROR = 'recurring_transactions_mark_missed.error',
  UPDATE_JOB_TRIGGERED = 'update_expected_transaction.job_triggered',
  UPDATE_JOB_CONNECTION_NOT_FOUND = 'update_expected_transaction.connection_not_found',
  UPDATE_JOB_SUCCESS = 'update_expected_transaction.successfully_updated',
  UPDATE_JOB_FAILURE = 'update_expected_transaction.update_failed',
  UPDATE_JOB_DEFERRED = 'update_expected_transaction.deferred',
  NEW_INCOME_DETECTION_ATTEMPT = 'recurring_transaction.add_new_income.attempt',
  NEW_INCOME_DETECTION_SUCCESS = 'recurring_transaction.add_new_income.success',
  NEW_INCOME_DETECTION_COUNT = 'recurring_transaction.add_new_income.count',
  NEW_INCOME_DETECTION_ERROR = 'recurring_transaction.add_new_income.error',
  NEW_INCOME_DETECTION_RATE_LIMTIED = 'recurring_transaction.add_new_income.rate_limited',
  NEW_INCOME_DETECTION_DEFERRED = 'recurring_transaction.add_new_income.deferred',
  NEW_EXPENSE_DETECTION_ATTEMPT = 'recurring_transaction.add_new_expense.attempt',
  NEW_EXPENSE_DETECTION_SUCCESS = 'recurring_transaction.add_new_expense.success',
  NEW_EXPENSE_DETECTION_COUNT = 'recurring_transaction.add_new_expense.count',
  NEW_EXPENSE_DETECTION_ERROR = 'recurring_transaction.add_new_expense.error',
  NEW_EXPENSE_DETECTION_RATE_LIMITED = 'recurring_transaction.add_new_expense.limited',
  MATCH_PREVIOUS_ACCOUNT_INCOME_ATTEMPT = 'recurring_transaction.match_previous_account_income.attempt',
  MATCH_PREVIOUS_ACCOUNT_INCOME_SUCCESS = 'recurring_transaction.match_previous_account_income.success',
  MATCH_PREVIOUS_ACCOUNT_INCOME_FAILURE = 'recurring_transaction.match_previous_account_income.failure',
  MATCH_PREVIOUS_ACCOUNT_ALREADY_HAS_INCOME = 'recurring_transaction.match_previous_account_income.already_has_income',
  MATCH_PREVIOUS_ACCOUNT_INCOME_COUNT = 'recurring_transaction.match_previous_account_income.count',
  SAVE_PREVIOUS_ACCOUNT_INCOME_COUNT = 'recurring_transaction.save_previous_account_income.count',
  SET_MAIN_PAYCHECK = 'recurring_transaction.auto_set_main_paycheck',
  SINGLE_MATCH_ATTEMPT = 'recurring_transaction.single_match.attempt',
  SINGLE_MATCH_SUCCESS = 'recurring_transaction.single_match.success',
  SINGLE_MATCH_FAILURE = 'recurring_transaction.single_match.failure',
  SINGLE_MATCH_COUNT = 'recurring_transaction.single_match.count',
}

export const metrics = wrapMetrics<RecurringTransactionMetrics>();
