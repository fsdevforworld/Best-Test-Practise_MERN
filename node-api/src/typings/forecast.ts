import { BankTransactionResponse } from '@dave-inc/wire-typings';

export interface IForecastExpectedTransactionPlain {
  id: number;
  amount: number;
  date: string;
  displayName: string;
  userFriendlyName: string;
  occurredTransaction?: BankTransactionResponse;
  recurringTransactionId: number;
  recurringTransactionUuid?: string;
}
