import { action } from 'typesafe-actions';

import { ConfigType } from '@dave-inc/wire-typings';

import { APIClientAction, APIError } from 'store/api-client-middleware';

export const getConfigLoad = () => action('CONFIG_LOAD');
export const getConfigSuccess = (response: ConfigType) => action('CONFIG_SUCCESS', response);
export const getConfigFail = (err: APIError) => action('CONFIG_FAIL', err);

export function getConfig(): APIClientAction<ConfigType> {
  return {
    actions: [getConfigLoad, getConfigSuccess, getConfigFail],
    promise: (client) => client.get('/v2/config'),
  };
}
