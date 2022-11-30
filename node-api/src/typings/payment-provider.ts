import { Moment } from 'moment';

import { ExternalTransactionStatus } from '@dave-inc/wire-typings';

import { TransactionSettlementSource } from './external-transaction';

import { Advance, Payment, SubscriptionPayment } from '../models';
import { FetchTransactionOptions } from '@dave-inc/loomis-client';
export {
  PaymentGateway,
  PaymentProcessor,
  IPaymentGateway,
  ReversalStatus,
  PaymentProviderSuccessStatus,
  PaymentProviderTransactionStatus,
  PaymentProviderTransactionType,
  PaymentProviderErrorStatus,
  PaymentProviderTransaction,
  CreateTransactionOptions,
  FetchTransactionOptions,
  ReverseTransactionOptions,
} from '@dave-inc/loomis-client';

export type PaymentLikeObject = Payment | SubscriptionPayment;

export interface IExternalTransaction {
  externalId?: string;
  referenceId?: string;
  advanceId?: number;
  bankAccountId?: number;
  advance?: Advance;
  userId?: number;
}

export type FetchByExternalOrReferenceOptions = {
  nodeId: string;

  userId: string;

  fingerPrint: string;

  oauthKey: string;
};

export type RefreshExternalTransactionOptions = FetchTransactionOptions & {
  advanceId?: number;

  bankAccountId?: number;

  paymentMethodId?: number;

  transactionSettlementSource?: {
    sourceId: number;

    sourceType: TransactionSettlementSource;
  };

  status?: ExternalTransactionStatus;

  created?: Moment;

  updated?: Moment;

  userId?: number;
};
