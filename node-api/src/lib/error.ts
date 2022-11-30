import ErrorHelper from '@dave-inc/error-helper';
import { BankingDataSource } from '@dave-inc/wire-typings';
import { FailureMessageKey } from '../translations';
import { CreateTransactionOptions } from '../typings';
import { PaymentProviderTransaction } from '../typings';
import {
  BaseDaveApiError,
  define,
  IBaseErrorOptions,
  I502ErrorOptions,
} from '@dave-inc/error-types';

export * from '@dave-inc/error-types';

export interface IErrorOptions extends IBaseErrorOptions {
  isRetryableForCollection?: boolean;
}

export class BaseApiError extends BaseDaveApiError {
  public isRetryableForCollection?: boolean;

  public constructor(
    message: string,
    {
      statusCode = 500,
      name = 'InternalApi',
      customCode = null,
      data = {},
      interpolations = {},
      showUuid = true,
      isRetryableForCollection,
    }: IErrorOptions,
  ) {
    super(message, { statusCode, name, customCode, data, interpolations, showUuid });
    this.isRetryableForCollection = isRetryableForCollection;
  }
}

export enum CUSTOM_ERROR_CODES {
  // helper/recurring-transaction
  RECURRING_TRANSACTION_TOO_MANY_OBSERVED = 1,
  RECURRING_TRANSACTION_FAILED_EXPECTED_SCORE = 2,
  RECURRING_TRANSACTION_NOT_FOUND = 3,
  RECURRING_TRANSACTION_STOPPED_OCCURRING = 4,
  RECURRING_TRANSACTION_INVALID_INCOME_TYPE = 5,
  RECURRING_TRANSACTION_NOT_ENOUGH_MATCHING = 6,
  RECURRING_TRANSACTION_SHOULD_PROMOTE_PENDING = 7,
  // lib/debit-micro-deposit
  DEBIT_CARD_VERIFICATION_WITHDRAW_FAILED = 100,
  DEBIT_CARD_VERIFICATION_CANCEL_FAILED = 101,
  DEBIT_CARD_VERIFICATION_TIMEOUT = 102,
  DEBIT_CARD_VERIFICATION_UNABLE_TO_VERIFY = 103,
  // v2/user
  USER_INVALID_CREDENTIALS = 200,
  USER_VERIFICATION_MESSAGES_UNSUBSCRIBED = 201,
  USER_DELETED_ACCOUNT_TOO_SOON = 202,
  USER_INVALID_ADDRESS = 203,
  USER_INCOMPLETE_ADDRESS = 204,
  USER_MFA_REQUIRED_FOR_LOGIN = 205,
  USER_RESET_PASSWORD_TOKEN_EXPIRED = 206,
  USER_DENY_NAME_CHANGE = 207,
  USER_LESS_THAN_18 = 208,
  USER_DENY_UPDATE_ADDRESS = 209,
  // v2/bank_connection
  BANK_CONNECTION_DATA_SOURCE_REQUEST_ERROR = 300,
  BANK_CONNECTION_DATA_SOURCE_LOGIN_REQUIRED = 301,

  // helper/bank_account
  BANK_CONNECTION_DISCONNECTED = 350,
  BANK_ACCOUNT_TRY_AGAIN = 351,
  BANK_BALANCE_ACCESS_LIMIT = 352,
  BANK_DATA_SOURCE_SERVER_ERROR = 353,

  // v2/advance/*
  DEFAULT_ACCOUNT_REMOVED = 380,

  TRANSACTION_HASH_INSUFFICIENT = 400,
  TRANSACTION_COUNT_INSUFFICIENT = 401,
  ADVANCE_PAYMENT_METHOD_EXPIRING_SOON = 402,
  ADVANCE_CHANGE_IN_INCOME = 403,
  ADVANCE_CHANGE_IN_ELIGIBILITY = 404,
  ADVANCE_PAYBACK_DATE_NOT_WITHIN_RANGE = 405,
  ADVANCE_ONE_AT_A_TIME = 406,

  // lib/risepay.ts and lib/tabapay.ts
  BANK_DENIED_CARD = 500,
  PROVIDER_DENIAL = 501,
  PAYMENT_PROCESSOR_DOWN = 502,
  DUPLICATE_CARD = 503,

  // v2/phone_number_change_request
  DUPLICATE_ACCOUNTS_DO_NOT_MATCH = 600,
  CHANGE_REQUEST_EXPIRED = 601,
  INVALID_VERIFICATION_CODE = 602,

  // v2/payment-method
  PAYMENT_METHOD_UNSUPPORTED_TYPE = 700,
  PAYMENT_METHOD_UNSUPPORTED_INSTANT_TRANSFER = 701,
  PAYMENT_METHOD_INVALID_CARD_NUMBER = 702,
  PAYMENT_METHOD_FAILED_AVS = 703,

  PAYMENT_METHOD_RECENTLY_FAILED_BIN = 704,

  // v2/payment
  PAYMENT_CANNOT_WITHIN_24_HOURS = 800,

  // banking direct
  BANKING_DIRECT_UNAUTHORIZED = 900,
  BANKING_DIRECT_BAD_REQUEST = 901,
  BANKING_DIRECT_UNHANDLED_ERROR = 902,
  FORCE_APP_RE_INSTALL = 1000,
}

export const gatewayService = 'node-api';
export const UnsupportedBankConnection = define('UnsupportedBankConnection', 422);
export const PlaidForceNewConnectionError = define('PlaidForceNewConnectionError', 400);
export const PlaidResponseError = define('PlaidResponse', 502, {
  gatewayService,
  failingService: 'plaid',
});
export const USPSResponseError = define('USPSResponse', 502, {
  gatewayService,
  failingService: 'usps',
});
export const SubscriptionCollectionError = define('SubscriptionCollection', 500);
export const SynapsePayError = define('SynapsePay', 502, {
  gatewayService,
  failingService: 'synapse-pay',
});
export const LoomisUnavailableError = define('LoomisUnavailable', 503);
export const HeathUnavailableError = define('HeathUnavailable', 503);
export const ApprovalEngineRunError = define('ApprovalEngineRun', 500);
export const BrazeError = define('Braze', 502, { failingService: 'braze', gatewayService });

export const EmpyrError = define('Empyr', 400);
export const BankDataSyncError = define('BankDataSync', 500);
export const TwilioError = define('Twilio', 502, {
  gatewayService,
  failingService: 'twilio',
});
export const SendgridEmailError = define('SendgridEmailError', 502, {
  gatewayService,
  failingService: 'sendgrid',
});
export const TransactionFetchError = define('TransactionFetchError', 400);
export const RedeemSubscriptionBillingPromotionError = define('RedeemSubscriptionBillingPromotionError', 500);
export const SynapseMicrodepositVerificationFailure = define('SynapseMicrodepositVerificationError', 401);
export const ZendeskError = define('Zendesk', 502, {
  gatewayService,
  failingService: 'zendesk',
});
export const AppcastResponseError = define('AppcastResponseError', 502, {
  gatewayService,
  failingService: 'appcast',
});
export const AppcastInvalidJobIdError = define('AppcastInvalidJobIdError', 404);
export const TaskShouldRetry = define('TaskShouldRetry', 500);
export const ApprovalNotFoundError = define('ApprovalNotFoundError', 404);
export const UnsupportedPaymentProcessorError = define('UnsupportedPaymentProcessorError', 422);

// Auth Errors
export const InvalidSessionError = define('InvalidSession', 401);
export const UnauthorizedError = define('Unauthorized', 403); // Deprecated. The term "Unauthorized" is ambiguous. Did you mean "Forbidden", or "Unauthenticated"?
export const UnprocessableEntityError = define('UnprocessableEntity', 422);
export const InvalidCredentialsError = define('InvalidCredentials', 401); // Deprecated. Invalid credentials could mean 403?
export const UnauthenticatedError = define('Unauthenticated', 401); // We couldn't figure out who you are.
export const ForbiddenError = define('Forbidden', 403); // We recognize who you are, but you are not permitted here.

// Errors from failure with Sombra service
export const SombraSessionExchangeFailure = define('SombraExchangeFailure', 502);
export const SombraRsaKeyFetchError = define('SombraRsaKeyFetchError ', 502);
export const SombraTokensDisabledError = define('SombraTokensDisabledError ', 502);
export const SombraUnexpectedError = define('SombraUnexpectedError ', 502);

export class PaymentProcessorError extends BaseApiError {
  public processorResponse: string;
  public processor: string;
  public processorHttpStatus: number;
  public gateway: string;
  constructor(message: string, processorResponse: string, options: IErrorOptions = {}) {
    const { statusCode = 424, customCode = null, data = {} } = options;
    const { processor = null, processorHttpStatus = null, gateway = null } = data as {
      processor?: string;
      processorHttpStatus?: number;
      gateway?: string;
    };
    super(message, { statusCode, name: 'PaymentProcessor', customCode, data });
    this.gateway = gateway;
    this.processorResponse = processorResponse;
    this.processor = processor;
    this.processorHttpStatus = processorHttpStatus;
  }
}

type ExternalTransactionErrorOptions = Omit<I502ErrorOptions, 'gatewayService'> & {
  transaction: PaymentProviderTransaction | CreateTransactionOptions;
  originalError?: Error;
};
export class ExternalTransactionError extends BaseApiError {
  public transaction: PaymentProviderTransaction | CreateTransactionOptions;
  constructor(message: string, options: ExternalTransactionErrorOptions) {
    const { transaction } = options;
    super(message, {
      statusCode: 502,
      name: 'ExternalTransaction',
      data: { transaction, originalError: options.originalError },
      gatewayService,
    });
    this.transaction = transaction;
  }
}

export class ForceAppReInstallError extends BaseApiError {
  constructor(message: string, options: Omit<IErrorOptions, 'statusCode' | 'customCode'> = {}) {
    const { data } = options;
    if (!message) {
      message = FailureMessageKey.DefaultAccountDisconnected;
    }
    super(message, {
      statusCode: 400,
      name: 'DefaultAccountRemoved',
      customCode: CUSTOM_ERROR_CODES.FORCE_APP_RE_INSTALL,
      data,
    });
  }
}

export class DefaultAccountRemovedError extends BaseApiError {
  constructor(message: string, options: IErrorOptions = {}) {
    const {
      statusCode = 400,
      customCode = CUSTOM_ERROR_CODES.DEFAULT_ACCOUNT_REMOVED,
      data,
    } = options;
    if (!message) {
      message = FailureMessageKey.DefaultAccountDisconnected;
    }
    super(message, { statusCode, name: 'DefaultAccountRemoved', customCode, data });
  }
}

export class BankingDirectError extends BaseApiError {
  constructor(message: string, statusCode: number, id: number, innerError?: Error) {
    const formattedError = innerError !== null ? ErrorHelper.logFormat(innerError) : null;
    super(message, {
      statusCode,
      failingService: 'banking-direct',
      gatewayService: 'node-api',
      data: {
        error: {
          id,
          message,
          innerError: formattedError,
        },
      },
    });
  }
}

export class BankDataSourceRefreshError extends BaseApiError {
  public source: BankingDataSource;

  constructor(
    message: string,
    {
      customCode,
      source,
      statusCode = 400,
    }: {
      customCode: CUSTOM_ERROR_CODES;
      source: BankingDataSource;
      statusCode?: number;
    },
  ) {
    super(message, { customCode, name: 'BankDataSourceRefresh', statusCode });

    this.source = source;
  }
}

export class GenericUpstreamError extends BaseApiError {
  public innerError: Error;
  constructor(innerError: Error) {
    const formattedError = ErrorHelper.logFormat(innerError);
    super('GenericUpstream error, see inner error for detail', {
      statusCode: 502,
      failingService: 'unknown/generic',
      gatewayService: 'node-api',
      data: {
        error: {
          innerError: formattedError,
        },
      },
    });
    this.innerError = innerError;
  }
}
