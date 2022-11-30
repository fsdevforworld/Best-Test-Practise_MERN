import { BankAccountSubtype, BankAccountType, BankingDataSource } from '@dave-inc/wire-typings';
import { Moment } from 'moment';

export enum BankingDataSourceErrorType {
  UserInteractionRequired = 'USER_INTERACTION_REQUIRED',
  Disconnected = 'DISCONNECTED',
  NotateOnly = 'NOTATE_ONLY',
  NoOp = 'NO_OP',
  InvalidRequest = 'INVALID_REQUEST',
  InstitutionError = 'INSTITUTION_ERROR',
  RequestTimedOut = 'REQUEST_TIMED_OUT',
  RateLimitExceeded = 'RATE_LIMIT_EXCEEDED',
  NoLongerSupported = 'NO_LONGER_SUPPORTED',
  InternalServerError = 'INTERNAL_SERVER_ERROR',
  AccountNumbersNotSupported = 'ACCOUNT_NUMBERS_NOT_SUPPORTED',
  AccountDeleted = 'ACCOUNT_DELETED',
}

export type BankAccountResponse = {
  bankingDataSource: BankingDataSource;
  externalId: string;
  available: number | null;
  current: number | null;
  lastFour: string | null;
  nickname: string | null;
  subtype: BankAccountSubtype;
  type: BankAccountType;
  account?: string;
  routing?: string;
};

export type BankNexusResponse = {
  externalId: string;
  authToken: string;
  externalInstitutionId?: string;
};

export type BankTransactionResponse = {
  externalId: string;
  pendingExternalId?: string;
  bankAccountExternalId: string;
  amount: number;
  transactionDate: Moment;
  pending: boolean;
  externalName: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  plaidCategory?: string[];
  plaidCategoryId?: string;
  referenceNumber?: string;
  ppdId?: string;
  payeeName?: string;
  metadata?: any;
  cancelled?: boolean;
  returned?: boolean;
};
