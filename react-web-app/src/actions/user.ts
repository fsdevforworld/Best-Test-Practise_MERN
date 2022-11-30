import { action } from 'typesafe-actions';

import { StandardResponse, UserResponse, VerificationInfoResponse } from '@dave-inc/wire-typings';

import { APIClientAction, APIError } from 'store/api-client-middleware';

type VerifyUserSuccessResponse =
  | { isNewUser?: boolean }
  | VerificationInfoResponse
  | StandardResponse;

export const verifyUserLoad = () => action('VERIFY_USER_LOAD');
export const verifyUserSuccess = (data: VerifyUserSuccessResponse) =>
  action('VERIFY_USER_SUCCESS', data);
export const verifyUserFail = (err: APIError) => action('VERIFY_USER_FAIL', err);

export function verifyUser(phoneNumber: string): APIClientAction<VerifyUserSuccessResponse> {
  return {
    actions: [verifyUserLoad, verifyUserSuccess, verifyUserFail],
    promise: (client) =>
      client.post('/v2/user/verify', {
        data: {
          phoneNumber,
          numCodeDigits: 6,
          isSignUp: true,
        },
      }),
  };
}

export const verifyCodeLoad = () => action('VERIFY_CODE_LOAD');
export const verifyCodeSuccess = (user: UserResponse) => action('VERIFY_CODE_SUCCESS', user);
export const verifyCodeFail = (err: APIError) => action('VERIFY_CODE_FAIL', err);

// TODO make all fields required when we migrate legacy registration
export function verifyCode(data: {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  phoneNumber: string;
  code: string;
}): APIClientAction<UserResponse> {
  return {
    actions: [verifyCodeLoad, verifyCodeSuccess, verifyCodeFail],
    promise: (client) =>
      client.post('/v2/user', {
        data,
      }),
  };
}

export const getUserLoad = () => action('GET_USER_LOAD');
export const getUserSuccess = (user: UserResponse) => action('GET_USER_SUCCESS', user);
export const getUserFail = (err: APIError) => action('GET_USER_FAIL', err);

export function getUser(): APIClientAction<UserResponse> {
  return {
    actions: [getUserLoad, getUserSuccess, getUserFail],
    promise: (client) => {
      return client.get('/v2/user');
    },
  };
}

export const setTempUser = (email: string, password: string, phoneNumber: string) =>
  action('SET_TEMP_USER', { email, password, phoneNumber });

export const clearTempUser = () => action('CLEAR_TEMP_USER');

export const setEmailAndPasswordLoad = () => action('SET_EMAIL_AND_PASSWORD_LOAD');
export const setEmailAndPasswordSuccess = (success: StandardResponse) =>
  action('SET_EMAIL_AND_PASSWORD_SUCCESS', success);
export const setEmailAndPasswordFail = (err: APIError) =>
  action('SET_EMAIL_AND_PASSWORD_FAILED', err);

export const setEmailAndPassword = (
  email: string,
  password: string,
  token: string = '',
): APIClientAction<StandardResponse> => {
  return {
    actions: [setEmailAndPasswordLoad, setEmailAndPasswordSuccess, setEmailAndPasswordFail],
    promise: (client) => {
      return client.patch(`/v2/user/set_email_password/${token}`, {
        data: {
          email,
          password,
        },
      });
    },
  };
};

export const setPromoCodeLoad = () => action('SET_PROMO_CODE_LOAD');
export const setPromoCodeSuccess = () => action('SET_PROMO_CODE_SUCCESS');
export const setPromoCodeFail = (err: APIError) => action('SET_PROMO_CODE_FAIL', err);

export function setPromoCode(promotionCode: string): APIClientAction<UserResponse> {
  return {
    actions: [getUserLoad, getUserSuccess, getUserFail],
    promise: (client) => {
      return client.post(`/v2/subscription_billing_promotion/${promotionCode}/redeem`);
    },
  };
}

// Stored in backend as snake_case
/* eslint-disable camelcase */
type UserSettings = {
  low_balance_alert?: number;
  sms_notifications_enabled?: boolean;
  push_notifications_enabled?: boolean;
  default_tip?: number;
};
/* eslint-enable camelcase */

export const updateUserSettingsLoad = () => action('UPDATE_USER_SETTINGS_LOAD');
export const updateUserSettingsSuccess = () => action('UPDATE_USER_SETTINGS_SUCCESS');
export const updateUserSettingsFail = (err: APIError) => action('UPDATE_USER_SETTINGS_FAIL', err);

export function updateUserSettings(userSettings: UserSettings): APIClientAction<UserResponse> {
  return {
    actions: [getUserLoad, getUserSuccess, getUserFail],
    promise: (client) => {
      return client.patch(`/v2/user`, { data: { settings: userSettings } });
    },
  };
}
