import { Moment } from 'moment';

export type BankConnectionSyncPayload = {
  startDate: string;
  endDate: string;
  bankAccounts: BankAccountSyncPayload[];
  bankTransactions: BankTransactionSyncPayload[];
};

export type BankAccountSyncPayload = {
  externalId: string;
  bankConnectionExternalId: string;
};

export type BankAccountPayload = {
  accountId: string;
  balances: {
    available: number | null;
    current: number | null;
    [key: string]: any;
  };
  mask: string | null;
  name: string | null;
  subtype: string | null;
  type: string | null;
};

export type BankTransactionSyncPayload = {
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
};
