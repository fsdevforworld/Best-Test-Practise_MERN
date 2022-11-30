import { action } from 'typesafe-actions';

import { APIClientAction, APIError } from 'store/api-client-middleware';

export const getCheckDuplicateEmailLoad = () => action('CHECK_EMAIL_DUPLICATE_LOAD');
export const getCheckDuplicateEmailSuccess = (response: null) =>
  action('CHECK_EMAIL_DUPLICATE_SUCCESS', response);
export const getCheckDuplicateEmailFail = (err: APIError) =>
  action('CHECK_EMAIL_DUPLICATE_FAIL', err);

export function getCheckDuplicateEmail(email: string): APIClientAction<null> {
  return {
    actions: [
      getCheckDuplicateEmailLoad,
      getCheckDuplicateEmailSuccess,
      getCheckDuplicateEmailFail,
    ],
    promise: (client) =>
      client.get('/v2/email_verification/check_duplicate', {
        params: { email },
      }),
  };
}
