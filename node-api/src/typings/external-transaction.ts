import { Moment } from 'moment';
import {
  PaymentGateway,
  PaymentProcessor,
  PaymentProviderTransactionStatus,
  PaymentProviderTransactionType,
} from './payment-provider';
import {
  AdvanceNetwork,
  ExternalTransactionProcessor,
  ExternalTransactionStatus,
  TransactionSettlementStatus,
  TransactionSettlementType,
} from '@dave-inc/wire-typings';
import Payment from '../models/payment';
import SubscriptionPayment from '../models/subscription-payment';

export type ExternalPayment = {
  id: string;
  type: ChargeableMethod;
  status: ExternalTransactionStatus;
  amount: number;
  processor: ExternalTransactionProcessor;
  chargeable: any;
};

export enum ChargeableMethod {
  Ach = 'ach',
  DebitCard = 'debit-card',
}

export type ExternalPaymentCreator = (
  amount: number,
  paymentObject: Payment | SubscriptionPayment,
  time?: Moment,
) => PromiseLike<ExternalPayment>;

export type ErrorToBoolean = (ex: Error) => PromiseLike<boolean>;

export type ExternalDisbursement = {
  id: string;
  network?: AdvanceNetwork;
  processor: ExternalTransactionProcessor | PaymentProcessor;
  status: ExternalTransactionStatus;
};

export type ExternalMobilePayment = {
  transactionId: string;
  status: ExternalTransactionStatus;
  isAVSMatch: boolean;
};

export type ParsedCSVRow = {
  externalId: string;
  status: TransactionSettlementStatus;
  statusDate?: Moment;
  chargebackDate?: Moment;
  originalDate: Moment;
  amount: string;
  settlementType: TransactionSettlementType;
  fullName: string;
  lastFour: string;
  approvalCode?: string;
  network?: string;
  networkId?: string;
};

export type ChargebackCSVRow = {
  'Merchant Reference ID': string;
  'Original Transaction ID': string;
  'Exception Type': string;
  'Action-Status': string;
  'Status Date': string;
  'Exception Date': string;
  'Original Creation Date': string;
  'Original Processed Date': string;
  'Original Settled Amount': string;
  Firstname: string;
  Lastname: string;
  'Last 4': string;
  MID: string;
};

export type TabapayTransactionCSVRow = {
  'Transaction ID': string;
  'Reference ID': string;
  Status: string;
  Type: string;
  'Processed Date': string;
  'Transaction Amount': string;
  'First Name': string;
  'Last Name': string;
  'Last 4': string;
  'Approval Code': string;
  'Settlement Network': string;
  'Network ID': string;
};

export enum TransactionSettlementSource {
  Advance = 'ADVANCE',
  Payment = 'PAYMENT',
  SubscriptionPayment = 'SUBSCRIPTION_PAYMENT',
}

export type ExternalTransactionSearchResult = {
  externalId: string;
  referenceId?: string;
  amount?: number;
  gateway?: PaymentGateway;
  processor?: PaymentProcessor | ExternalTransactionProcessor;
  raw?: any;
  settlementRaw?: any;
  status: PaymentProviderTransactionStatus;
  type?: PaymentProviderTransactionType;
  isSettlement: boolean;
};
