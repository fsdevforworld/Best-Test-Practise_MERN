const URLS = {
  APP_STORE_ANDROID: 'https://go.onelink.me/NADQ/davesaves',
  APP_STORE_IOS: 'https://go.onelink.me/YWVv/davesaves',
  CONSENT_FOR_ELECTRONIC_DISCLOSURE: 'https://www.dave.com/consent-for-electronic-disclosure',
  FAQ: 'https://support.dave.com/hc',
  HOME: 'https://www.dave.com',
  PAYMENT_AUTHORIZATION: 'https://www.dave.com/payment-authorization',
  PRIVACY_POLICY: 'https://www.dave.com/privacy',
  SAVES: 'https://www.dave.com/saves',
  TERMS_OF_SERVICE: 'https://www.dave.com/terms',
};

interface Params {
  [key: string]: string;
}

export function getParams(url: string): Params {
  const paramString = url.split('?')[1];
  const params: Params = {};
  if (paramString) {
    const splitParams = paramString.split('&');
    splitParams.forEach((param) => {
      const pair = param.split('=');
      params[pair[0]] = decodeURIComponent(pair[1]);
    });
  }
  return params;
}

export default URLS;
