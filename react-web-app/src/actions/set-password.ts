import { StandardResponse } from '@dave-inc/wire-typings';

import { APIClientAction, APIError } from 'store/api-client-middleware';
import { action } from 'typesafe-actions';

export const setPasswordLoad = () => action('SET_PASSWORD_LOAD');
export const setPasswordSuccess = (success: StandardResponse) =>
  action('SET_PASSWORD_SUCCESS', success);
export const setPasswordFail = (err: APIError) => action('SET_PASSWORD_FAIL', err);

export const setPassword = (password: string, token: string): APIClientAction<StandardResponse> => {
  return {
    actions: [setPasswordLoad, setPasswordSuccess, setPasswordFail],
    promise: (client) => {
      return client.patch(`/v2/user/set_email_password/${token}`, {
        data: {
          password,
        },
      });
    },
  };
};
