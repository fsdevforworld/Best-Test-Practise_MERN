import * as plaid from 'plaid';
import * as config from 'config';
import * as md5 from 'md5';
import { User } from '../models';
import { Cache } from './cache';
import { isProdEnv, isTestEnv } from './utils';

const client = new plaid.Client({
  clientID: config.get('plaid.clientId'),
  secret: config.get('plaid.secret'),
  env: plaid.environments[config.get('plaid.environment') as string],
  options: {
    version: '2019-05-29',
  },
});

const plaidPublicTokenCache = new Cache('plaid-public-token-');

export async function getFromCacheOrCreatePublicToken(accessToken: string): Promise<string> {
  const cacheKey = md5(accessToken);
  const cached = await plaidPublicTokenCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const tokenObject = await client.createPublicToken(accessToken);
  const publicToken = tokenObject.public_token;
  const secondsIn30Minutes = 30 * 60;
  await plaidPublicTokenCache.set(cacheKey, publicToken, secondsIn30Minutes);

  return publicToken;
}

export async function createLinkItemToken({
  user,
  webhook,
  accessToken,
  redirectUri,
  androidPackageName,
  locale,
  selectAccount = false,
}: {
  user: User;
  webhook: string;
  accessToken?: string;
  redirectUri?: string;
  androidPackageName?: string;
  locale?: string | string[];
  selectAccount?: boolean;
}): Promise<string> {
  const language = getSupportedPlaidLanguage(locale);
  let params: plaid.CreateLinkTokenOptions = {
    user: {
      client_user_id: `${user.id}`,
      // @ts-ignore because this package's definition are outdate
      legal_name: user.lowerFullName,
    },
    client_name: 'Dave',
    country_codes: ['US'],
    products: accessToken ? null : ['transactions'],
    language,
    webhook,
    access_token: accessToken,
    redirect_uri: redirectUri,
    android_package_name: androidPackageName,
  };

  // in dev/staging our randomly generator numbers don't pass their validity tests
  if (isProdEnv() || isTestEnv()) {
    params.user = {
      ...params.user,
      // @ts-ignore because this package's definition are outdate
      phone_number: user.phoneNumber,
      phone_number_verified_time: user.created,
    };
  }

  // dont pass account_filters for update mode
  if (selectAccount && !accessToken) {
    params = {
      ...params,
      link_customization_name: 'select_account',
      account_filters: {
        depository: {
          account_subtypes: ['checking', 'prepaid'],
        },
      },
    };
  }
  const { link_token: linkToken } = await client.createLinkToken(params);

  return linkToken;
}

export const getSupportedPlaidLanguage = (locale: string | string[]) => {
  const defaultLanguage = 'en';
  const supportedLangauges = ['en', 'fr', 'es', 'nl'];

  if (Array.isArray(locale)) {
    locale = locale[0];
  }

  return supportedLangauges.includes(locale) ? locale : defaultLanguage;
};

export default client;
