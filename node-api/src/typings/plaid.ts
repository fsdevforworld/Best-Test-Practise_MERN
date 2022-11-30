import { AccountsResponse, PlaidError } from 'plaid';

export enum PlaidErrorCode {
  ItemLoginRequired = 'ITEM_LOGIN_REQUIRED',
  NoAuthAccounts = 'NO_AUTH_ACCOUNTS',
  MissingFields = 'MISSING_FIELDS',
  UnknownFields = 'UNKNOWN_FIELDS',
  InvalidField = 'INVALID_FIELD',
  InvalidBody = 'INVALID_BODY',
  InvalidHeaders = 'INVALID_HEADERS',
  NotFound = 'NOT_FOUND',
  SandboxOnly = 'SANDBOX_ONLY',
  ProductsNotSupported = 'PRODUCTS_NOT_SUPPORTED',
  InvalidApiKeys = 'INVALID_API_KEYS',
  InvalidEnvironment = 'UNAUTHORIZED_ENVIRONMENT',
  InvalidAccessToken = 'INVALID_ACCESS_TOKEN',
  InvalidPublicToken = 'INVALID_PUBLIC_TOKEN',
  InvalidProduct = 'INVALID_PRODUCT',
  InvalidAccountId = 'INVALID_ACCOUNT_ID',
  InvalidInstitution = 'INVALID_INSTITUTION',
  AccountsLimit = 'ACCOUNTS_LIMIT',
  AdditionLimit = 'ADDITION_LIMIT',
  AuthLimit = 'AUTH_LIMIT',
  TransactionsLimit = 'TRANSACTIONS_LIMIT',
  IdentityLimit = 'IDENTITY_LIMIT',
  IncomeLimit = 'INCOME_LIMIT',
  ItemGetLimit = 'ITEM_GET_LIMIT',
  RateLimit = 'RATE_LIMIT',
  BalanceLimit = 'BALANCE_LIMIT',
  InternalServerError = 'INTERNAL_SERVER_ERROR',
  PlannedMaitenance = 'PLANNED_MAINTENANCE',
  InvalidCredentials = 'INVALID_CREDENTIALS',
  InvalidMFA = 'INVALID_MFA',
  InvalidUpdatedUsername = 'INVALID_UPDATED_USERNAME',
  ItemLocked = 'ITEM_LOCKED',
  ItemNoError = 'ITEM_NO_ERROR',
  ItemNotSupported = 'ITEM_NOT_SUPPORTED',
  ItemNoVerification = 'ITEM_NO_VERIFICATION',
  ItemNotFound = 'ITEM_NOT_FOUND',
  IncorrectDepositAmounts = 'INCORRECT_DEPOSIT_AMOUNTS',
  TooManyVerificationAttempts = 'TOO_MANY_VERIFICATION_ATTEMPTS',
  UserSetupRequired = 'USER_SETUP_REQUIRED',
  MFANotSupported = 'MFA_NOT_SUPPORTED',
  NoAccounts = 'NO_ACCOUNTS',
  ProductNotReady = 'PRODUCT_NOT_READY',
  VerificationExpired = 'VERIFICATION_EXPIRED',
  InstitutionDown = 'INSTITUTION_DOWN',
  InstitutionNotResponding = 'INSTITUTION_NOT_RESPONDING',
  InstitutionNotAvailable = 'INSTITUTION_NOT_AVAILABLE',
  InstitutionNoLongerSupported = 'INSTITUTION_NO_LONGER_SUPPORTED',
  DuplicateAccountsFound = 'DUPLICATE_ACCOUNTS_FOUND',
}

export enum PlaidErrorTypes {
  ItemError = 'ITEM_ERROR',
  AssetReportError = 'ASSET_REPORT_ERROR',
  InvalidRequest = 'INVALID_REQUEST',
  InvalidInput = 'INVALID_INPUT',
  RateLimitExceeded = 'RATE_LIMIT_EXCEEDED',
  ApiError = 'API_ERROR',
  AuthError = 'AUTH_ERROR',
  InstitutionError = 'INSTITUTION_ERROR',
  DuplicateAccountError = 'DUPLICATE_ACCOUNT_ERROR',
}

export type PlaidGetTokenError = {
  display_message: string;
  error_code: string;
  error_message: string;
  error_type: string;
  request_id: string;
  suggested_action: any;
  status_code: number;
};

export type PlaidItemWebhook = {
  item_id: string;
  webhook_type: PlaidWebhookType.Item;
  webhook_code: PlaidItemWebhookCode;
  error?: PlaidError;
};

export type PlaidTransactionWebhook = {
  item_id: string;
  webhook_type: PlaidWebhookType.Transaction;
  webhook_code: PLAID_WEBHOOK_CODE;
  new_transactions?: number;
  removed_transactions?: string[];
};

export enum PLAID_WEBHOOK_CODE {
  INITIAL_UPDATE = 'INITIAL_UPDATE',
  DEFAULT_UPDATE = 'DEFAULT_UPDATE',
  HISTORICAL_UPDATE = 'HISTORICAL_UPDATE',
  TRANSACTIONS_REMOVED = 'TRANSACTIONS_REMOVED',
}

export enum PlaidWebhookType {
  Transaction = 'TRANSACTIONS',
  Item = 'ITEM',
}

export enum PlaidItemWebhookCode {
  WebhookUpdateAcknowledged = 'WEBHOOK_UPDATE_ACKNOWLEDGED',
  Error = 'ERROR',
}

export interface IExtendedPlaidError extends PlaidError {
  // these fields aren't included in the PlaidError interface
  status_code: number;
  request_id: string;
}

// doesn't exist in plaid TS type definitions
export type PlaidAccountAndRouting = {
  account: string;
  routing: string;
  account_id: string;
};

export interface IAccountsWithAuth extends AccountsResponse {
  numbers: PlaidAccountAndRouting[];
}

export type PlaidInstitutionStatusDetails = {
  breakdown: {
    error_institution: number;
    error_plaid: number;
    refresh_interval?: PlaidInstitutionRefreshInterval;
    success: number;
  };
  last_status_change: string;
  status: PlaidInstitutionStatus;
};

export type PlaidInstitutionSubsystemStatus = {
  item_logins: PlaidInstitutionStatusDetails;
  transactions_updates: PlaidInstitutionStatusDetails;
};

export enum PlaidInstitutionStatus {
  DOWN = 'DOWN',
  DEGRADED = 'DEGRADED',
  HEALTHY = 'HEALTHY',
}

export enum PlaidInstitutionRefreshInterval {
  DELAYED = 'DELAYED',
  STOPPED = 'STOPPED',
  NORMAL = 'NORMAL',
}
