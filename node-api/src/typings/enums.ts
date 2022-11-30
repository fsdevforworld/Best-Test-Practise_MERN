export enum AdvanceCollectionTrigger {
  ADMIN = 'admin',
  ADMIN_MANUAL_CREATION = 'admin-manual-creation',
  BANK_ACCOUNT_UPDATE = 'bank-account-update',
  BLIND_COLLECTION = 'blind-collection',
  BLIND_COLLECTION_EXPERIMENT = 'blind-collection-experiment',
  BLIND_INSTITUTION_COLLECTION = 'blind-institution-collection',
  BLIND_INSTITUTION_PAYDAY_COLLECTION = 'blind-institution-payday-collection',
  BLIND_PAYDAY_DATE_COLLECTION = 'blind-payday-date-collection',
  DAILY_CRONJOB = 'daily-cronjob',
  PAYDAY_CATCHUP = 'payday-catchup',
  NO_OVERDRAFT_ACCOUNT = 'no-overdraft-account',
  PREDICTED_PAYDAY = 'predicted-payday',
  TIVAN_CRONJOB = 'tivan-cronjob',
  TIVAN = 'tivan',
  USER = 'user',
  USER_ONE_TIME_CARD = 'user-one-time-card',
  USER_WEB = 'user-web',
}

export enum BalanceCheckTrigger {
  USER_REFRESH = 'USER_REFRESH',
  ADVANCE_COLLECTION = 'ADVANCE_COLLECTION',
  SUBSCRIPTION_COLLECTION = 'SUBSCRIPTION_COLLECTION',
  ADVANCE_APPROVAL = 'ADVANCE_APPROVAL',
  DEBIT_MICRO_DEPOSIT = 'DEBIT_MICRO_DEPOSIT',
}

export enum TransactionType {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
}

export enum BankConnectionUpdateType {
  RECONNECTED = 'BANK_CONNECTION_RECONNECTED',
  INITIAL_UPDATE = 'BANK_CONNECTION_INITIAL_UPDATE',
  DEFAULT_UPDATE = 'BANK_CONNECTION_DEFAULT_UPDATE',
  HISTORICAL_UPDATE = 'BANK_CONNECTION_HISTORICAL_UPDATE',
  TRANSACTIONS_REMOVED = 'BANK_CONNECTION_TRANSACTIONS_REMOVED',
  DISCONNECTED = 'BANK_CONNECTION_DISCONNECTED',
  DATA_SOURCE_ERROR = 'BANK_CONNECTION_DATA_SOURCE_ERROR',
  CREATE_ERROR = 'BANK_CONNECTION_CREATE_ERROR',
  CREATED = 'BANK_CONNECTION_CREATED',
}

export enum RollDirection {
  FORWARD = 1,
  BACKWARD = -1,
}

export enum OrderByDirection {
  asc = 'ASC',
  desc = 'DESC',
}

export enum BooleanValue {
  True = 'TRUE',
  False = 'FALSE',
}

export enum RecurringTransactionStatus {
  VALID = 'VALID',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  NOT_VALIDATED = 'NOT_VALIDATED',
  INVALID_NAME = 'INVALID_NAME',
  MISSED = 'MISSED',
  SINGLE_OBSERVATION = 'SINGLE_OBSERVATION',
}

export enum UnpauseReason {
  DATE = 'date',
  ADVANCE_DISBURSED = 'advance disbursed',
  QUALIFIED_FOR_ADVANCE_AMOUNT = 'qualified for advance amount',
}

export enum BalanceLogCaller {
  BinDevSeed = 'BIN_DEV_SEED',
  BankOfDaveTransactionsPubsubConsumer = 'BANK_OF_DAVE_TRANSACTIONS_PUBSUB_CONSUMER',
  DaveBankingBankAccountFetch = 'DAVE_BANKING_BANK_ACCOUNT_FETCH',
  BankConnectionRefresh = 'BANK_CONNECTION_REFRESH',
  PlaidUpdaterPubsub = 'PLAID_UPDATER_PUBSUB',
  PlaidUpdaterPubsubBackfill = 'PLAID_UPDATER_PUBSUB_BACKFILL',
  DebitCardMicroDepositStep1 = 'DEBIT_CARD_MICRO_DEPOSIT_STEP_1',
  DebitCardMicroDepositStep2 = 'DEBIT_CARD_MICRO_DEPOSIT_STEP_2',
  DebitCardMicroDepositStep3 = 'DEBIT_CARD_MICRO_DEPOSIT_STEP_3',
  DailyAutoRetrieveJob = 'DAILY_AUTO_RETRIEVE_JOB',
  DailyScheduledAutoRetrieveJob = 'DAILY_SCHEDULED_AUTO_RETRIEVE',
  LateACHCollectionJob = 'LATE_ACH_COLLECTION_JOB',
  PastDueSubscriptionCollection = 'PAST_DUE_SUBSCRIPTION_COLLECTION',
  SubscriptionCollectionJob = 'SUBSCRIPTION_COLLECTION_JOB',
  DailyScheduledTineyMoneyHardPullAutoRetrieveJob = 'DAILY_SCHEDULED_TINY_MONEY_HARD_PULL_AUTO_RETRIEVE',
  UserRefresh = 'USER_REFRESH',

  Unknown = 'UNKNOWN',
}

export enum FreeMonthSourceName {
  Rewards = 'Rewards',
  Referral = 'Referral',
  Referred = 'Referred',
  Promotion = 'Promotion',
}

export enum FreeMonthSourceField {
  RewardsLedgerId = 'rewardsLedgerId',
  ReferredUserId = 'referredUserId',
}

export enum BankingDataSyncSource {
  BankOfDaveTransactionsConsumer = 'consume-bank-of-dave-transactions',
  BankTransactionCopy = 'bank-transaction-copy',
  EligibilityNode = 'eligibility-node',
  InsufficientFundsTransactionConsumer = 'insufficient-funds-transaction-consumer',
  PlaidUpdater = 'plaid-updater',
  SupportDashboard = 'support-dashboard',
  UserRefresh = 'user-refresh',
}
