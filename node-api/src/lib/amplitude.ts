// tslint:disable-next-line:no-require-imports
import Amplitude = require('amplitude');
import { isTestEnv } from './utils';
import * as config from 'config';
import logger from './logger';
import * as request from 'superagent';
import ErrorHelper from '@dave-inc/error-helper';

export type EventData = {
  eventType: string;
  userId?: string | number;
  insertId?: string;
  deviceId?: string;
  sessionId?: number; // unix timestamp in ms
  eventProperties?: { [key: string]: any };
  userProperties?: { [key: string]: any };
  appVersion?: string;
  osName?: string;
  deviceBrand?: string;
  deviceManufacturer?: string;
  deviceModel?: string;
  deviceType?: string;
  locationLat?: string;
  locationLng?: string;
  time?: string;
};

export type AmplitudeRevenueEvent = EventData & {
  revenue: number;
  revenue_type?: string;
  product_id?: string;
};

export type IdentifyData = {
  user_id?: string | number;
  user_properties?: { [key: string]: any };
};

class DaveAmplitude extends Amplitude {
  public EVENTS = {
    PLAID_AUTH_PERMISSION_REQUESTED: 'plaid auth permission requested',
    ZENDESK_USER_FOUND: 'matched zendesk ticket to user',
    ZENDESK_USER_NOT_FOUND: 'zendesk ticket user not found',
    TWILIO_CONTRACT_CHANGE_CHECK: 'twilio contract change check',
  };

  public async track(
    data: EventData | AmplitudeRevenueEvent | Array<EventData | AmplitudeRevenueEvent>,
  ) {
    /* istanbul ignore else */
    if (!isTestEnv()) {
      try {
        await super.track(data);
      } catch (error) {
        logger.error('Error sending event to amplitude', { error });
      }
    }
  }

  public identify(data: IdentifyData) {
    /* istanbul ignore else */
    if (!isTestEnv()) {
      return super.identify(data);
    }
  }

  public deleteUser(userId: number, deleterUserId: number) {
    const AMPLITUDE_API_KEY: string = config.get('amplitude.apiKey');
    const AMPLITUDE_SECRET_KEY: string = config.get('amplitude.secretKey');
    return request
      .post('https://amplitude.com/api/2/deletions/users')
      .auth(AMPLITUDE_API_KEY, AMPLITUDE_SECRET_KEY)
      .send({
        user_ids: [userId],
        ignore_invalid_id: 'True',
        delete_from_org: 'True',
        requester: deleterUserId,
      })
      .then(res => {
        logger.info('Successfully send delete request to amplitude', { body: res.body });
      })
      .catch(err => {
        logger.error('Error deleting user from amplitude', { error: ErrorHelper.logFormat(err) });
      });
  }
}

const amplitude = new DaveAmplitude(config.get('amplitude.apiKey'));

export default amplitude;
