import { Request } from 'express';
import { User } from '../models';

export type PlaidUserIdentity = {
  id: string;
  email: string;
  name: string;
  address: string;
  address2: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
};

export type PlaidAccount = {
  id: string;
  ownerIdentities: [string];
  type: string;
  subtype: string;
  currency: 'USD';
  name: string;
  currentBalance: string;
  availableBalance: string;
  routingNumber: string;
  wireRouting?: string;
  accountNumber?: string;
};

export type PlaidUserResponse = {
  identities: [PlaidUserIdentity];
  accounts: [PlaidAccount];
};

export interface IBankingDirectRequest<T = any> extends Request {
  user: User;
  body: T;
}

export type PlaidTransaction = {
  id: string;
  accountId: string;
  amount: number;
  currency: string;
  description: string;
  pending: boolean;
  transactedAt: string;
  settledAt: string | null;
  spenderIdentity?: string;
  merchantName?: string;
  merchantCategory?: string;
  merchantAddress?: {
    email?: string;
    name?: string;
    address?: string;
    address2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    phone?: string;
  };
  geolocation?: {
    lat: string;
    lng: string;
  };
};

export type PlaidTransactionResponse = {
  total: number;
  transactions: PlaidTransaction[];
};
