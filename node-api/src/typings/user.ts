import { Moment } from 'moment';
import { Role } from '../models';

export type Address = {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  zipCode: string;
};

export type AddressVerification = {
  errorMsg?: string;
  normalizedAddress?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    countryCode: string;
  };
  originalAddress: Address;
};

export type CooloffStatus = {
  coolOffDate?: Moment;
  isCoolingOff: boolean;
};

export type UserSettings = {
  default_tip?: number;
  default_account?: string;
  advance_tutorial_seen?: boolean;
  institution_notify_query?: string;
  low_balance_alert?: number;
  push_notifications_enabled?: boolean;
  sms_notifications_enabled?: boolean;
  target_spend?: boolean;
  paid_with_direct_deposit?: boolean;
  credit_score_range?: string;
  unemployment_reason?: string;
  hide_side_hustle?: boolean;
};

export type UserIdentityVerificationFields = {
  firstName?: string;
  lastName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  countryCode?: string;
  birthdate?: Moment;
  ssn?: string;
};

export type UserUpdateFields = {
  firstName?: string;
  lastName?: string;
  birthdate?: Moment;
  email?: string;
  defaultBankAccountId?: number;
  fcmToken?: string;
  profileImage?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  countryCode?: string;
  licenseFile?: Express.Multer.File;
  licenseImage?: string;
  secondaryEmail?: string;
  settings?: UserSettings;
  phoneNumber?: string;
  overrideSixtyDayDelete?: boolean;
};

export type DashboardUserUpdateFields = {
  roles?: Role[];
  allowDuplicateCard?: boolean;
};

export enum AddressUpdateRejectReason {
  KycLockPeriod = 'KYC_LOCK_PERIOD',
  TooManyRecentUpdates = 'TOO_MANY_RECENT_UPDATES',
}

export type AddressUpdateEligibility = {
  allowAddressUpdate: boolean;
  addressUpdateRejectReason?: AddressUpdateRejectReason;
};
