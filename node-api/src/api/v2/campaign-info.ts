import { get as _get, omitBy, isNil } from 'lodash';
import { Response } from 'express';
import { CampaignInfo, sequelize } from '../../models';
import { IDaveRequest, IDaveResponse, AnalyticsEvent } from '../../typings';
import { FreeMonthSourceName, FreeMonthSourceField } from '../../typings/enums';
import promotionsClient from '@dave-inc/promotions-client';

import { getClickLabel, getNormalizedNetwork, AppsFlyerEvents } from '../../lib/appsflyer';
import { dogstatsd } from '../../lib/datadog-statsd';
import amplitude from '../../lib/amplitude';
import { InvalidParametersError } from '../../lib/error';
import logger from '../../lib/logger';
import { getMySQLError, isRecoverableMySQLError } from '../../lib/sequelize-helpers';

import { AuditLog } from '../../../src/models';

import { addAttributedFreeMonths } from '../../helper/subscription-billing';
import { CampaignInfoResponse, StandardResponse } from '@dave-inc/wire-typings';
/**
 * Campaign info
 *
 */
export async function get(
  req: IDaveRequest,
  res: IDaveResponse<CampaignInfoResponse>,
): Promise<Response> {
  const { appsflyerDeviceId } = req.query;
  const result = await CampaignInfo.findOne({ where: { appsflyerDeviceId } });

  if (!result) {
    return res.sendStatus(200);
  }

  return res.send(result.serialize());
}

/**
 * Campaign info row is first created with an install eventa
 *
 */
export async function post(
  req: IDaveRequest,
  res: IDaveResponse<CampaignInfoResponse>,
): Promise<Response> {
  const data = req.body;
  const deviceId = req.get('X-DEVICE-ID');
  const appsflyerDeviceId = data.appsflyerDeviceId;
  const upsertData = {
    appsflyerDeviceId, // unique constraint for upsert
    deviceId,
  } as any;

  const eventName = data.eventName;
  dogstatsd.increment('campaign_info_event_received', { eventName });
  switch (eventName) {
    case 'app installed':
      upsertData.daveInstalledDate = parseInt(data.firstInstallTime, 10);
      break;
    case 'onInstallConversionData':
      // Save Referrer
      if (data.af_referrer_customer_id) {
        const referrerId = parseInt(data.af_referrer_customer_id, 10);
        const campaign = data.campaign;
        upsertData.referrerId = referrerId;
        upsertData.referrerName = data.af_referrer_name;
        upsertData.referrerImageUrl = data.af_referrer_image_url;

        const refereeId = req.get('X-Amplitude-Device-ID');
        if (refereeId) {
          amplitude.track({
            deviceId: refereeId,
            eventType: AnalyticsEvent.InstalledFromReferral,
            eventProperties: { campaign, referrerId },
          });
        }
        amplitude.track({ userId: referrerId, eventType: AnalyticsEvent.ReferredUserInstalled });
        dogstatsd.increment('campaign_info_installed_from_referral');
      }
      break;
    default:
      throw new InvalidParametersError(`Invalid eventName: ${eventName}`);
  }

  await insertFallbackToUpdate(upsertData);
  dogstatsd.increment('campaign_info_event_processed', { eventName });
  const result = await CampaignInfo.findOne({ where: { appsflyerDeviceId } });
  return res.send(result.serialize());
}

export async function auditReferralPromotionEvent(
  message: string,
  successful: boolean,
  info: { userId: number; referrerId: number },
) {
  const makeAuditLogValue = (id: number) => {
    return {
      userId: id,
      type: 'REFERRAL',
      message,
      successful,
      extra: {
        referree_user_id: info.userId,
        referrer_user_id: info.referrerId,
      },
    };
  };

  await AuditLog.create(makeAuditLogValue(info.userId));
  await AuditLog.create(makeAuditLogValue(info.referrerId));
}

/**
 * @desc AppsFlyer Webhook to record install attribution data
 * @see {@link https://support.appsflyer.com/hc/en-us/articles/207034356-Push-APIs-Installation-and-Conversion-Notification-APIs}
 * @param req IDaveRequest
 * @param res Response
 * @return Promise<Response>
 */
export async function webhookPost(
  req: IDaveRequest,
  res: IDaveResponse<StandardResponse>,
): Promise<Response> {
  const data = req.body;
  const eventName: string = data.event_name || data.event_type;

  dogstatsd.increment('campaign_info_webhook_event_received', getWebhookTags(data));
  const upsertData = await getAppsflyerEventData(data);
  const { appsflyerDeviceId, userId } = upsertData;

  switch (eventName) {
    case AppsFlyerEvents.USER_CREATED:
      await insertFallbackToUpdate(upsertData);
      if (userId && appsflyerDeviceId) {
        const campaignInfo: CampaignInfo | null = await CampaignInfo.findOne({
          where: { appsflyer_device_id: appsflyerDeviceId },
        });
        if (campaignInfo?.referrerId && campaignInfo?.campaign) {
          dogstatsd.increment('campaign_info_referrer_found', getWebhookTags(data));
          try {
            await promotionsClient.handleReferredUser({
              userId: campaignInfo.userId,
              campaignId: campaignInfo.campaign, // referral campaigns do not have ids
              referrerId: campaignInfo.referrerId,
            });
            dogstatsd.increment('campaign_info_referred_user_success', getWebhookTags(data));
          } catch (error) {
            const message = 'Failed call to promotionsClient handleReferredUser';
            logger.error(`campaign_info: ${message}`, {
              name: error.name,
              message: error.message,
            });
            await auditReferralPromotionEvent(message, false, {
              userId: campaignInfo.userId,
              referrerId: campaignInfo.referrerId,
            });
            dogstatsd.increment('campaign_info_referred_user_failure', getWebhookTags(data));
          }
        } else {
          dogstatsd.increment('campaign_info_user_created_without_referral', getWebhookTags(data));
        }
      } else {
        logger.error('campaign_info: missing user id', upsertData);
        dogstatsd.increment('campaign_info_missing_install_record', getWebhookTags(data));
      }
      break;
    case AppsFlyerEvents.INSTALLED:
      const appsflyerInstallEventReceived = true;
      await insertFallbackToUpdate({
        ...upsertData,
        appsflyerInstallEventReceived,
      });
      // TODO: re-implement amplitude identify
      // https://demoforthedaves.atlassian.net/browse/GROW-1287
      break;
    case AppsFlyerEvents.BANK_CONNECTED:
      const bankConnectedDate = data.event_time;
      await insertFallbackToUpdate({
        ...upsertData,
        bankConnectedDate,
      });

      // if referred, give the referrer and referree a free month
      const info = await CampaignInfo.findOne({
        where: {
          appsflyerDeviceId,
          campaign: 'free month',
        },
      });
      if (info?.referrerId) {
        const freeMonths = 1;

        await sequelize.transaction(async transaction => {
          await addAttributedFreeMonths(
            info.referrerId,
            freeMonths,
            transaction,
            FreeMonthSourceName.Referral,
            FreeMonthSourceField.ReferredUserId,
            info.userId,
          );
          await addAttributedFreeMonths(
            info.userId,
            freeMonths,
            transaction,
            FreeMonthSourceName.Referred,
            FreeMonthSourceField.ReferredUserId,
            info.userId,
          );
        });

        await AuditLog.create({
          userId: info.userId,
          type: 'USER_REFERRED',
          message: `user with id ${info.userId} was referred`,
          successful: true,
          extra: {
            referree_user_id: info.userId,
            referrer_user_id: info.referrerId,
          },
        });
      }
      break;
    default:
      break;
  }
  dogstatsd.increment('campaign_info_webhook_event_processed', getWebhookTags(data));
  return res.send({ ok: true });
}

async function insertFallbackToUpdate(updates: Partial<CampaignInfo>) {
  try {
    await CampaignInfo.create(updates);
  } catch (insertErr) {
    await handleWriteError(insertErr, updates);
  }
}

async function handleWriteError(error: any, updates: Partial<CampaignInfo>) {
  if (isRecoverableMySQLError(error)) {
    try {
      Boolean(updates)
        ? await CampaignInfo.update(updates, {
            where: { appsflyerDeviceId: updates.appsflyerDeviceId },
          })
        : logAndThrowUpdateError(error);
    } catch (updateErr) {
      logAndThrowUpdateError(updateErr);
    }

    return;
  }

  throw error;
}
function logAndThrowUpdateError(error: any) {
  const sqlErrorCode = getMySQLError(error);

  if (sqlErrorCode) {
    dogstatsd.increment('campaign_info.upsert.error_updating_campaign_info', { sqlErrorCode });
  }

  throw error;
}

function getWebhookTags(data: any) {
  return {
    eventName: data.event_name || data.event_type,
    platform: data.platform,
    hasCUID: Boolean(data.customer_user_id).toString(),
  };
}

async function getAppsflyerEventData(data: any) {
  const appsflyerDeviceId = data.appsflyer_id || data.appsflyer_device_id;
  const userId = data.customer_user_id;
  return omitBy(
    {
      adgroup: data.af_ad || data.fb_adgroup_name,
      adset: data.af_adset || data.fb_adset_name,
      appsflyerDeviceId, // unique constraint for upsert
      appsflyerInstalledDate: data.install_time_selected_timezone,
      appVersion: data.app_version,
      attributedTouchTime: data.attributed_touch_time,
      attributedTouchType: data.attributed_touch_type,
      campaign: data.campaign || data.fb_campaign_name,
      // use fb_campaign_id over campaign_id because it matches creative_spend table
      campaignId: data.fb_campaign_id || data.af_c_id || data.campaign_id,
      clickLabel: getClickLabel(data),
      deviceType: data.device_type || `${data.device_brand} ${data.device_model}`,
      extra: data,
      isRetargeting: data.is_retargeting,
      keywords: data.af_keywords,
      network: getNormalizedNetwork(data.media_source),
      osVersion: data.os_version,
      platform: data.platform,
      referrerId: data.referrerId,
      userId,
    },
    isNil,
  );
}
