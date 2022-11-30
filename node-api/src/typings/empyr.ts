import { Moment } from 'moment';
import { EmpyrEventType } from '@dave-inc/wire-typings';

export enum EmpyrOfferRewardType {
  PERCENT = 'PERCENT',
  FIXED = 'FIXED',
}

export type EmpyrAuth = {
  clientId: string;
  accessToken: string;
  userToken: string;
};

export type EmpyrConfig = {
  url: string;
  clientId: string;
  clientSecret: string;
};

export type EmpyrOffer = {
  id: number;
  rewardType: string;
  rewardValue: number;
  requiresActivation: boolean;
  finePrint: string;
  link: {
    id: number;
    lastActivationDate: number;
    dateAdded: number;
    status: string;
  };
};

export type EmpyrMerchant = {
  id: number;
  name: string;
  distance?: number;
  latitude: number;
  longitude: number;
  primaryCategory: string;
  categories: string[];
  rating: number;
  ratingCount: number;
  address: {
    streetAddress: string;
    city: string;
    state: string;
    postalCode: string;
  };
  phone: string;
  thumbnailUrl: string;
  offers: EmpyrOffer[];
  medias: [
    {
      largeUrl: string;
    },
  ];
};

export type EmpyrEventTransaction = {
  id: number;
  cashbackAmount: number;
  dateOfTransaction: Moment;
  dateProcessed: Moment;
  cardId: number;
  last4: string;
  clearingAmount: number;
  authorizationAmount: number;
  user: {
    id: number;
    email: string;
  };
  redemptions: [
    {
      publisherCommission: number;
    },
  ];
};

export type EmpyrEventContractType = {
  type: EmpyrEventType;
  transaction: EmpyrEventTransaction;
};
