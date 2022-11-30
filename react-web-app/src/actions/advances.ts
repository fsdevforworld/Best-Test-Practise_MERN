import { action } from 'typesafe-actions';

import { AdvanceTermsResponse } from '@dave-inc/wire-typings';

import { APIClientAction, APIError } from 'store/api-client-middleware';

export const advanceTermsLoad = () => action('ADVANCE_TERMS_LOAD');
export const advanceTermsSuccess = (response: AdvanceTermsResponse[]) =>
  action('ADVANCE_TERMS_SUCCESS', response);
export const advanceTermsFail = (err: APIError) => action('ADVANCE_TERMS_FAIL', err);

export type AdvanceTermsType = (bankAccountId: number) => Promise<AdvanceTermsResponse[]>;

export function advanceTerms(bankAccountId: number): APIClientAction<AdvanceTermsResponse[]> {
  return {
    actions: [advanceTermsLoad, advanceTermsSuccess, advanceTermsFail],
    promise: (client) =>
      client.get('/v2/advance/terms', {
        params: { bank_account_id: bankAccountId, showAllResults: true },
        timeout: 0, // Infinite.
      }),
  };
}
