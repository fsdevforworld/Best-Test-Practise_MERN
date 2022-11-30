import { Moment } from '@dave-inc/time-lib';

type UpdateAddressPayload = {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  zipCode: string;
};

type UpdateBirthdatePayload = {
  birthdate: Moment;
};

type UpdateDefaultBankAccountPayload = {
  defaultBankAccountId: number;
};

type UpdateFirstNamePayload = {
  firstName: string;
};

type UpdateLastNamePayload = {
  lastName: string;
};

type UpdatePhoneNumberPayload = {
  phoneNumber: string;
};

type UpdateOverrideSixtyDayDeletePayload = {
  overrideSixtyDayDelete: boolean;
};

type UpdatePayload =
  | UpdateAddressPayload
  | UpdateBirthdatePayload
  | UpdateDefaultBankAccountPayload
  | UpdateFirstNamePayload
  | UpdateLastNamePayload
  | UpdatePhoneNumberPayload
  | UpdateOverrideSixtyDayDeletePayload;

export {
  UpdateAddressPayload,
  UpdateBirthdatePayload,
  UpdateFirstNamePayload,
  UpdateLastNamePayload,
  UpdatePhoneNumberPayload,
  UpdateOverrideSixtyDayDeletePayload,
};

export default UpdatePayload;
