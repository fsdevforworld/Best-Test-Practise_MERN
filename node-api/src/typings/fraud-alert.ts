export enum FraudAlertReason {
  DuplicateEmail = 'Duplicate email claim attempt',
  TooManyUsersOnDevice = 'Too many users on device',
  UnauthorizedTransactionReported = 'Dave transaction reported as unauthorized',
  BlacklistSsn = 'Blacklist ssn',
  TooManyOneTimePayments = 'Too many one-time-card payments',
  TooManyOneTimePaymentAttempts = 'Too many one-time-card payment attempts',
}
