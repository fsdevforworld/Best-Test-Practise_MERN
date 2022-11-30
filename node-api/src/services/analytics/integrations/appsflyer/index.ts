import * as config from 'config';
import * as request from 'superagent';
import { moment } from '@dave-inc/time-lib';
import { InvalidParametersError } from '@dave-inc/error-types';

import { isTestEnv } from '../../../../lib/utils';
import { CampaignInfo } from '../../../../models';

import { TrackBody, Platform } from '../../types';

export async function track(body: TrackBody) {
  const {
    appsflyer_id,
    customer_user_id,
    eventName,
    eventValue,
    ip,
    platform,
  } = await validateRequest(body);

  const appId: string = config.get(`appsflyer.${platform}.appId`);
  const devKey: string = config.get(`appsflyer.${platform}.devKey`);
  const afUrl = `${config.get('appsflyer.url')}/${appId}`;
  const eventTime = moment()
    .utc()
    .format('YYYY-MM-DD HH:mm:ss.SSS');

  if (isTestEnv()) {
    return;
  }

  return request
    .post(afUrl)
    .set({ authentication: devKey, 'Content-Type': 'application/json' })
    .send({
      af_events_api: 'true',
      appsflyer_id,
      customer_user_id,
      eventCurrency: 'USD',
      eventName,
      eventTime,
      eventValue,
      ip,
      json: true,
    });
}

async function validateRequest(body: TrackBody) {
  if (!('userId' in body)) {
    throw new InvalidParametersError(null, {
      required: ['userId'],
      provided: Object.keys(body),
    });
  }

  let platform = getPlatformFromBody(body);
  let appsflyerId = getIdFromBody(body);
  if (!platform || !appsflyerId) {
    const info = await getAnalyticsProfileInfo(body.userId);
    platform = platform ?? info.platform;
    appsflyerId = appsflyerId ?? info.appsflyerId;
  }

  if (!platform) {
    throw new InvalidParametersError(null, {
      data: {
        required: ['context.device.type'],
      },
    });
  }

  if (!appsflyerId) {
    throw new InvalidParametersError(null, {
      data: {
        required: ['integrations.AppsFlyer.appsFlyerId'],
      },
    });
  }

  return {
    appsflyer_id: appsflyerId,
    customer_user_id: body.userId,
    eventName: body.event,
    eventValue: JSON.stringify(body.properties) ?? '',
    ip: body.context?.ip,
    platform,
  };
}

function getPlatformFromBody(body: TrackBody) {
  return body.context?.device?.type;
}

function getIdFromBody(body: TrackBody) {
  const appsflyerIntegration = body?.integrations?.AppsFlyer;
  if (typeof appsflyerIntegration === 'boolean') {
    return undefined;
  }
  return appsflyerIntegration?.appsFlyerId;
}

async function getAnalyticsProfileInfo(userId: string) {
  const campaignInfos = await CampaignInfo.findAll({
    order: [['created', 'DESC']],
    where: { userId },
  });
  const appsflyerId = campaignInfos[0]?.appsflyerDeviceId;
  // Not all campaign_info rows have the "platform" field.
  // We pull all of them so that we can filter client-side to get the latest "platform" value.
  const platform = campaignInfos.find(a => a.platform)?.platform as Platform;
  return { appsflyerId, platform };
}
