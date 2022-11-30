import * as Bluebird from 'bluebird';
import * as config from 'config';
import * as parse from 'csv-parse';
import { get } from 'lodash';
import * as querystring from 'querystring';
import * as request from 'superagent';
import * as url from 'url';
import ErrorHelper from '@dave-inc/error-helper';
import { moment } from '@dave-inc/time-lib';

import { dogstatsd } from '../lib/datadog-statsd';
import * as facebook from '../lib/facebook';
import UUID from '../lib/uuid';
import { CampaignInfo } from '../models';
import { AppsflyerProperties, IDaveRequest, Platforms, RawReportRecord } from '../typings';
import logger from './logger';

const API_TOKEN: string = config.get(`appsflyer.pullApiToken`);
const GDPR_URL = config.get(`appsflyer.gdprUrl`);

export enum AppsFlyerEvents {
  ADVANCE_DISBURSED = 'advance disbursed',
  ADVANCE_TIP_REVENUE_UPDATED = 'advance tip revenue updated',
  PHONE_NUMBER_VERIFIED = 'phone number verified',
  BANK_CONNECTED = 'bank connected',
  // this is the server to server event that we want to fire for now to see
  // if we are able to match up
  BANK_CONNECTED_S2S = 'bank connected s2s',
  DAVE_CHECKING_ACCOUNT_READY = 'checking account ready',
  DAVE_CHECKING_DEPOSIT_RECEIVED = 'checking deposit received',
  DAVE_CHECKING_DIRECT_DEPOSIT_RECEIVED = 'checking direct deposit received',
  USER_CREATED = 'user created',
  INSTALLED = 'install',
  ONE_DAVE_CONVERSION = 'one dave conversion',
}

// key - appsflyer network, val - normalized network
// used to have a common naming convention of networks
// across both AF and singular
const networks = {
  'Adwords UAC Installs': 'AdWords',
  'Apple Search Ads': 'Apple Search Ads',
  'Facebook Ads': 'Facebook',
  'Facebook Installs': 'Facebook',
  'Facebook Messenger Installs': 'Facebook',
  'Facebook Profile Page ': 'Facebook',
  'Instagram ': 'Facebook',
  'Instagram Installs': 'Facebook',
  'Off-Facebook Installs': 'Facebook',
  'Snapchat Installs': 'Snapchat',
  'Social Facebook': 'Facebook',
  'Twitter Installs': 'Twitter',
  adcolony_int: 'AdColony',
  adperio_int: 'Adperio',
  applovin_int: 'AppLovin',
  globalwide_int: 'GlobalWide Media',
  googleadwords_int: 'AdWords',
  inboxdollars_int: 'InboxDollars',
  koneocpa_int: 'Koneo Mobile (CPA)',
  network: 'New Value',
  pinterest_int: 'Pinterest',
  prodege_int: 'Swagbucks',
  quora_int: 'Quora',
  reddit_int: 'Reddit',
  snapchat_int: 'Snapchat',
  tapjoy_int: 'Tapjoy',
  vungle_int: 'Vungle',
  yahoogemini_int: 'Verizon',
};

type AppsflyerEventProperties = AppsflyerProperties & {
  eventName: AppsFlyerEvents;
  eventValue?: string;
};

export async function logAppsflyerEvent({
  appsflyerDeviceId,
  eventName,
  eventValue = '',
  ip,
  platform,
  userId,
}: AppsflyerEventProperties): Promise<void> {
  if (!appsflyerDeviceId || !platform) {
    // Not all campaign_info rows have the "platform" field.
    // We pull all of them so that we can filter client-side to get the latest "platform" value.
    const campaignInfos = await CampaignInfo.findAll({
      order: [['created', 'DESC']],
      where: { userId },
    });
    const [latestCampaignInfo] = campaignInfos;

    if (!appsflyerDeviceId) {
      appsflyerDeviceId = latestCampaignInfo?.appsflyerDeviceId;
    }

    if (!platform) {
      const campaignInfoWithPlatform = campaignInfos.find(a => a.platform);
      if (!campaignInfoWithPlatform) {
        dogstatsd.increment('log_appsflyer_event.platform_field_missing', { eventName });
        logger.error('logAppsflyerEvent: missing platform', { userId, eventName });
        return;
      }
      platform = campaignInfoWithPlatform?.platform as Platforms;
    }
  }

  if (!appsflyerDeviceId) {
    dogstatsd.increment('log_appsflyer_event.appsflyer_device_id_missing', { eventName });
    logger.error(`logAppsflyerEvent: missing appsflyerDeviceId`, { userId, platform, eventName });
    return;
  }

  try {
    const appId: string = config.get(`appsflyer.${platform}.appId`);
    const devKey: string = config.get(`appsflyer.${platform}.devKey`);
    const afUrl = `${config.get('appsflyer.url')}/${appId}`;
    const eventTime = moment()
      .utc()
      .format('YYYY-MM-DD HH:mm:ss.SSS');
    const body = {
      af_events_api: 'true',
      appsflyer_id: appsflyerDeviceId,
      customer_user_id: userId,
      eventCurrency: 'USD',
      eventName,
      eventTime,
      eventValue,
      ip,
    };
    await request
      .post(afUrl)
      .set({ authentication: devKey, 'Content-Type': 'application/json' })
      .send({ ...body, json: true });
    await facebook.track({ event_name: eventName, user_data: { external_id: String(userId) } });
  } catch (error) {
    dogstatsd.increment('log_appsflyer_event.error', { eventName });
    logger.error(`logAppsflyerEvent: error`, { error, userId, platform, eventName });
  }
}

export function getEventPropertiesFromRequest(req: IDaveRequest): AppsflyerProperties {
  return {
    userId: req.user.id,
    ip: req.ip,
    appsflyerDeviceId: req.get('X-AppsFlyer-ID'),
    platform: req.get('X-Device-Type') === Platforms.iOS ? Platforms.iOS : Platforms.Android,
  };
}

/**
 * https://support.appsflyer.com/hc/en-us/articles/207034346-Pull-API-Pulling-Reports-Using-AppsFlyer-Pull-APIs#raw
 * @param day - YYYY-MM-DD format
 * @param platform app id in review bot
 * @param reportType report type to pull
 */
export async function getReport(
  from: string,
  to: string,
  platform: Platforms,
  reportType: string,
  additionalFields: string[] = [],
): Promise<RawReportRecord[]> {
  const appId: string = config.get(`appsflyer.${platform}.appId`);
  let reportUrl = `https://hq.appsflyer.com/export/${appId}/${reportType}/v5?api_token=${API_TOKEN}&from=${from}&to=${to}`;
  if (additionalFields.length) {
    reportUrl = `${reportUrl}&${additionalFields.join(',')}`;
  }

  const report = await request.get(reportUrl);
  const parseAsync = Bluebird.promisify((input: string, opts: parse.Options, cb: parse.Callback) =>
    parse(input, opts, cb),
  );
  return parseAsync(report.text, {
    relax_column_count: true,
    trim: true,
    columns: true,
  });
}

export const getReporter = (reportType: string, additionalFields: string[] = []) => (
  platform: Platforms,
) => (from: string, to: string) => getReport(from, to, platform, reportType, additionalFields);

export function getDates(from: string, to: string, step: number = 1): Array<[string, string]> {
  const format = 'YYYY-MM-DD';
  const dateRange = moment.range(moment(from), moment(to));
  const days: string[] = Array.from(dateRange.by('day', { step })).map(day => day.format(format));
  return days.map(start => {
    let end = moment(start)
      .add(step - 1, 'days')
      .format(format);
    if (moment(end) > moment(to)) {
      end = moment(to).format(format);
    }
    return [start, end];
  });
}

export const getBulkCreateOptions = (fields: string[], processName: string) => (
  current: number,
  total: number,
) => ({
  fields,
  updateOnDuplicate: fields,
  logging: () => {
    logger.info(`${processName}: batch processed`, { current, total });
  },
});

/**
 * @desc extract label from url
 * Example:
 *
 * data: {
 *   click_url: https://domain.com?clickid=CLICK_ID
 * }
 *
 * @param {object} data
 * @returns {string} click_id
 */
export function getClickLabel(data: any) {
  let clickLabel = '';
  if (data.click_url || data.original_url) {
    const { query } = url.parse(data.click_url || data.original_url);
    if (query) {
      const parsed = querystring.parse(query);
      const clickid = Array.isArray(parsed.clickid) ? parsed.clickid[0] : parsed.clickid;
      clickLabel = clickid;
    }
  }
  return clickLabel;
}

export function getNormalizedNetwork(afNetwork: string) {
  return get(networks, afNetwork, afNetwork);
}

export async function deleteUser(userId: number) {
  const requestUrl = `${GDPR_URL}?api_token=${API_TOKEN}`;

  try {
    const campaignInfo = await CampaignInfo.findOne({
      where: { userId },
      order: [['created', 'DESC']],
    });
    if (!campaignInfo) {
      logger.info('No campaign info found for user when trying to remove from Appsflyer');
      return;
    }
    const { platform, appsflyerDeviceId } = campaignInfo;

    const requestPayload = {
      subject_request_id: UUID.uuid(),
      subject_request_type: 'erasure',
      submitted_time: moment(),
      property_id: config.get(`appsflyer.${platform}.appId`),
      subject_identities: [
        {
          identity_type: 'appsflyer_id',
          identity_value: appsflyerDeviceId,
          identity_format: 'raw',
        },
      ],
    };

    const response = await request.post(requestUrl).send(requestPayload);
    logger.info('Successfully sent delete request to appsflyer', { body: response.body });
  } catch (err) {
    logger.error('Error deleting user from appsflyer', { error: ErrorHelper.logFormat(err) });
  }
}
