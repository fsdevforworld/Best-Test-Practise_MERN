import { action } from 'typesafe-actions';

import { BankAccountComplexResponse } from '@dave-inc/wire-typings';

import { APIClientAction, APIError } from 'store/api-client-middleware';

export const bankConnectLoad = () => action('BANK_CONNECT_LOAD');
export const bankConnectSuccess = (response: BankAccountComplexResponse[]) =>
  action('BANK_CONNECT_SUCCESS', response);
export const bankConnectFail = (err: APIError) => action('BANK_CONNECT_FAIL', err);

type BankConnectProps = {
  externalInstitutionId: string;
  plaidToken: string;
  isPlaidUpdateMode?: boolean;
  promotionCode?: string;
};

export type BankConnectType = (props: BankConnectProps) => Promise<BankAccountComplexResponse[]>;

export function bankConnect({
  externalInstitutionId,
  plaidToken,
  isPlaidUpdateMode = false,
  promotionCode = '',
}: BankConnectProps): APIClientAction<BankAccountComplexResponse[]> {
  return {
    actions: [bankConnectLoad, bankConnectSuccess, bankConnectFail],
    promise: (client) =>
      client.post('/v2/bank_connection', {
        timeout: 120000, // bank connection can take some time
        data: {
          externalInstitutionId,
          isPlaidUpdateMode,
          plaidToken,
          promotionCode,
        },
      }),
  };
}
