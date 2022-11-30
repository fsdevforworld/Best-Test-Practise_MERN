import { User } from '../../../models';

export type ValidCreateUserPayload = {
  user: User;
  newPhoneNumber: string;
  oldPhoneNumber: string;
};

export type CreatePhoneNumberChangeRequestParams = {
  user: User;
  newPhoneNumber: string;
  oldPhoneNumber: string;
  code: string;
};

export type CreatePhoneNumberChangeRequestPayload = {
  id?: number;
  emailSent: boolean;
};
