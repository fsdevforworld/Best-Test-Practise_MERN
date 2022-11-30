export const Config = {
  REACT_APP_ENVIRONMENT: process.env.REACT_APP_ENVIRONMENT,
  REACT_APP_API_URL: process.env.REACT_APP_API_URL,
  REACT_APP_PLAID_ENV: process.env.REACT_APP_PLAID_ENV,
  REACT_APP_PLAID_PUBLIC_KEY: process.env.REACT_APP_PLAID_PUBLIC_KEY,
  REACT_APP_PLAID_WEBHOOK_URL: process.env.REACT_APP_PLAID_WEBHOOK_URL,
  REACT_APP_AMPLITUDE_TOKEN: process.env.REACT_APP_AMPLITUDE_TOKEN,
  REACT_APP_BRAZE_TOKEN: process.env.REACT_APP_BRAZE_TOKEN,
  REACT_APP_APPSFLYER_INVITE_ONE_LINK_ID: process.env.REACT_APP_APPSFLYER_INVITE_ONE_LINK_ID,
  BRAZE_BASE_URL: 'https://daviik.iad-03.braze.com',
};

export function isDevEnv() {
  return process.env.NODE_ENV === 'development';
}
