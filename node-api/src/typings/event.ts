import { BankingDataSource } from '@dave-inc/wire-typings';
import { BankConnectionUpdateType } from './enums';
import { TransactionType } from './';
import { Moment } from 'moment';

export {
  IPaymentEventData,
  IPaymentUpdateEventData,
  IPaymentMethodEventData,
  IPaymentMethodUpdateEventData,
  IPaymentUpdateMessage,
} from '@dave-inc/loomis-client';

export enum EventTopic {
  UnderwritingMLScore = 'advance-approval-ml-score',
  UnderwritingMLScorePreprocess = 'advance-approval-ml-score-preprocess',
  BankConnectionUpdate = 'plaid-update', // TODO - rename topic to be more generic
  BankConnectionInitialUpdate = 'bank-connection-initial-update',
  BankTransactionBackfill = 'bank-transaction-backfill',
  RecordCreatedEvent = 'record-created',
  BankConnectionUpdateCompleted = 'bank-connection-update-completed',
  UserUpdated = 'user-updated',
  CollectAdvanceDailyAutoRetrieve = 'collect-advance',
  CollectAdvanceNoOverdraft = 'collect-advance-no-overdraft',
  CollectBigMoneyHardPulls = 'collect-big-money-hard-pulls',
  SynapsepayUpsertTransaction = 'synapsepay-upsert-transaction',
  CollectSubscription = 'collect-subscription',
  NewRecurringTransaction = 'new-recurring-transaction',
  DeleteBalanceLogFromSnowflake = 'delete_future_balance_log',
  DaveBankingAccountClosed = 'dave-banking-account-closed',
  TivanAdvanceProcessed = 'tivan-advance-processed',
  PaymentUpdate = 'payment-update',
  PaymentMethodUpdate = 'payment-method-update',
  PaymentMethodBackfill = 'payment-method-backfill',
  PaymentBackfill = 'payment-backfill',
  TabapayChargeback = 'tabapay-chargeback',
  TransactionSettlementUpdate = 'transaction-settlement-update',
}

export enum EventSubscriber {
  UnderwritingMLScorePreprocess = 'advance-approval-ml-score-preprocess',
  BankConnectionUpdater = 'plaid-updater', // TODO - rename subscriber to be more generic
  BigMoneyHardPullsCollector = 'collect-big-money-hard-pulls',
  AdvanceNoOverdraftCollector = 'collect-advance-no-overdraft',
  SynapsepayUpsertTransaction = 'synapsepay-upsert-transaction',
  BankConnectionUpdatedNewIncome = 'bank-connection-update-new-income',
  BankConnectionUpdatedNewExpenses = 'bank-connection-update-new-expenses',
  BankConnectionUpdatedTivan = 'bank-connection-update-tivan',
  Covid19NotifyStimulus = 'covid-19-notify-stimulus',
  DeleteBalanceLogFromSnowflake = 'delete_balance_log_from_snowflake',
  DaveBankingDetectFirstRecurringPaycheck = 'dave-banking-detect-first-recurring-paycheck',
  DaveBankingCloseDaveBankingAccount = 'dave-banking-close-dave-banking-account',
  RepaymentResultProcessor = 'repayment-result-processor',
}

export interface IBankConnectionUpdatedEventData {
  itemId: string;
  userId?: number;
  source: BankingDataSource;
  initial?: boolean;
  historical?: boolean;
  code?: string; // Only set for Plaid
  removed?: string[]; // Only set for Plaid
  // TODO:
  // This field is temporarily optional for migration
  // from boolean flags to this status field.
  // On removing the boolean flags, make this required
  updateType?: BankConnectionUpdateType;
}

export interface IBankTransactionBackfillEventData {
  source: BankingDataSource;
  bankTransaction: {
    id: number;
    bankAccountId: number;
    merchantInfoId: number;
    externalId: string;
    pending: boolean;
    plaidCategoryId?: string;
    transactionDate: string;
    transactionTimestamp?: string;
    externalName: string;
    displayName: string;
    pendingExternalName: string;
    pendingDisplayName: string;
    amount: number;
    address?: string;
    city?: string;
    state?: string;
    ppdId: string;
    payeeName: string;
    zipCode?: string;
    created: string;
    updated: string;
    deleted?: string;
    referenceNumber: string;
    plaidCategory?: string[];
  };
}

export interface IBankConnectionUpdateCompletedEventData {
  bankConnectionId: number;
  userId: number;
  bankAccountIds: number[];
  updateType: BankConnectionUpdateType;
  connection: {
    authToken: string;
    externalId: string;
    mxUserId?: string;
    userId: number;
    bankingDataSource: BankingDataSource;
    lastPull: string;
  };
  bankAccounts: Array<{ id: string; externalId: string }>;
  options: {
    historical?: boolean;
    startDate?: string;
    endDate?: string;
    source?: string;
    initialPull?: boolean;
    removed?: string[];
    expectedTransactionIds?: string[];
  };
}
export interface IUserUpdatedEventData {
  addressChanged?: boolean;
  emailChanged?: boolean;
  totalEmailChanges?: number;
  nameChanged?: boolean;
  phoneChanged?: boolean;
  userId: number;
}

export interface ICollectAdvanceDailyAutoRetrieveEventData {
  advanceId: number;
  time?: Moment;
}

export interface IUnderwritingMLScorePreprocessEventData {
  bankAccountId: number;
  trigger: UnderwritingMLScoreEventTrigger;
}

export enum UnderwritingMLScoreEventTrigger {
  PlaidUpdater = 'plaid-updater',
}

export interface IUnderwritingMLScoreEventData {
  user_id: number;
  bank_account_id: number;
  request_date: string;
  payback_date: string;
  trigger: UnderwritingMLScoreEventTrigger;
}

export interface INewRecurringTransactionData {
  recurringTransactionId: number;
  userId: number;
  bankAccountId: number;
  type: TransactionType;
  averageAmount: number;
  minimumAmount?: number;
  institutionId?: number;
  isDaveBankingDDEligible?: boolean;
}

export interface IDeleteBalanceLogFromSnowflakeData {
  bankAccountId: number;
  date: number;
}

export interface IRecordCreatedEvent {
  table: string;
  data: object;
}

export interface IDaveBankingAccountClosed {
  daveBankingAccountId: string;
  daveUserId: number;
}

export enum TivanResult {
  Success = 1,
  Failure = 2,
  Pending = 3,
  Error = 4,
}
export interface ITivanAdvanceProcessed {
  result: TivanResult;
  // placeholder until we finalize the Tivan typing and export it in a client library
  task: {
    advanceTasks: AdvanceTask[];
    taskPaymentMethods: TaskPaymentMethod[];
    taskId: string;
  };
}

// placeholder until we finalize the Tivan typing and export it in a client library
type AdvanceTask = {
  advanceId: number;
};

// placeholder until we finalize the Tivan typing and export it in a client library
type TaskPaymentMethod = {
  paymentMethodId: string;
  taskPaymentResults: TaskPaymentResult[];
};

// placeholder until we finalize the Tivan typing and export it in a client library
type TaskPaymentResult = {
  taskId: string;
  paymentMethodId: string;
  taskPaymentResultId: number;
  amountPennies: number;
  result: TivanResult;
  created: Date;
};
export interface ITabapayChargebackEventData {
  merchantReferenceId: string;
  originalTransactionId: string;
  exceptionType: string;
  actionStatus: string;
  statusDate: string;
  exceptionDate: string;
  originalCreationDate: string;
  originalProcessedDate: string;
  originalSettledAmount: string;
  firstName: string;
  lastName: string;
  last4: string;
  subClientId: string;
}
