import { moment } from '@dave-inc/time-lib';
import * as config from 'config';
// tslint:disable-next-line:no-require-imports
import bizSdk = require('facebook-nodejs-business-sdk');

import { AppsFlyerEvents } from '../lib/appsflyer';
import logger from './logger';
import { isTestEnv } from './utils';

const ACCESS_KEY = config.get('facebook.accessKey');
const PIXEL_ID = config.get('facebook.pixelId');

bizSdk.FacebookAdsApi.init(ACCESS_KEY);
const EventAdsPixel = new bizSdk.AdsPixel(PIXEL_ID);

type AtLeastOne<T, U = { [K in keyof T]: Pick<T, K> }> = Partial<T> & U[keyof U];

type UserData = {
  em: string; // hash
  ph: string; // hash
  ge: string; // hash
  db: string; // hash
  ln: string; // hash
  fn: string; // hash
  ct: string; // hash
  st: string; // hash
  zp: string; // hash›
  country: string; // hash
  external_id: string | string[];
  client_ip_address: string;
  client_user_agent: string;
  fbc: string;
  fbp: string;
  subscription_id: string;
  lead_id: number;
  fb_login_id: number;
};

type Params = {
  event_name: AppsFlyerEvents;
  user_data: AtLeastOne<UserData>;
};

type DataParams = {
  data: [
    {
      event_time: number;
      custom_data?: object;
      event_source_url?: string;
      opt_out?: boolean;
      event_id?: string;
      data_processing_options?: [any];
      data_processing_options_country?: number;
      data_processing_options_state?: number;
    } & Params,
  ];
};

export async function track({ event_name, user_data }: Params) {
  const FACEBOOK_CUSTOM_EVENTS = [
    AppsFlyerEvents.ADVANCE_DISBURSED,
    AppsFlyerEvents.ADVANCE_TIP_REVENUE_UPDATED,
  ];

  if (!FACEBOOK_CUSTOM_EVENTS.includes(event_name) || isTestEnv()) {
    return;
  }

  let response;
  const params: DataParams = {
    data: [
      {
        event_name,
        event_time: moment().unix(),
        user_data,
      },
    ],
  };

  try {
    response = await EventAdsPixel.createEvent([], params);
  } catch (error) {
    logger.error(`Error logging Facebook custom event ${event_name}`, { error, event_name });
  }

  return response;
}
