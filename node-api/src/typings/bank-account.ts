import { BankAccountSubtype, BankAccountType } from '@dave-inc/wire-typings';

export type BankAccountAndRouting = {
  account: string;
  routing: string;
};

export const SUPPORTED_BANK_ACCOUNT_TYPE = BankAccountType.Depository;
export const SUPPORTED_BANK_ACCOUNT_SUBTYPES = [
  BankAccountSubtype.Checking,
  BankAccountSubtype.PrepaidDebit,
  BankAccountSubtype.Prepaid,
];

export type BankAccountBalances = {
  available?: number;
  current?: number;
};
