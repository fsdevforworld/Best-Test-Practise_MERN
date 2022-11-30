import ErrorHelper from '@dave-inc/error-helper';
import * as request from 'superagent';
import {
  BrazeConnectedAudience,
  BrazeEvent,
  BrazePurchase,
  BrazeRecipient,
  BrazeUserAttributes,
} from '../typings';
import logger from '../../src/lib/logger';
import { snakeCase, transform } from 'lodash';
import { moment } from '@dave-inc/time-lib';
import { wrapMetrics } from './datadog-statsd';
import { BrazeError } from './error';
import * as config from 'config';
import { AuditLog } from '../models';

const BRAZE_URL = config.get('braze.trackUrl');
export const BRAZE_KEY = config.get('braze.key');
const gatewayService = 'node-api';
const failingService = 'braze';

export const enum BrazeMetrics {
  BRAZE_TRIGGER_CAMPAIGN_SUCCESS = 'braze.trigger_campaign.success',
  BRAZE_TRIGGER_CAMPAIGN_ERROR = 'braze.trigger_campaign.error',
}
const metrics = wrapMetrics<BrazeMetrics>();

/**
 * @see {@link https://www.braze.com/docs/developer_guide/rest_api/user_data/#user-track-endpoint|Docs}
 */
export async function track(data: {
  attributes?: BrazeUserAttributes[];
  events?: BrazeEvent[];
  purchases?: BrazePurchase[];
}) {
  const url = `${BRAZE_URL}/users/track`;

  const requestPayload = {
    api_key: BRAZE_KEY,
    ...transform(
      data,
      getSerialize({
        transformArrays: true,
        transformObjects: false,
      }),
    ),
  };

  const response = await request.post(url).send(requestPayload);
  if (response.body.errors) {
    throw new BrazeError('Some messages failed', {
      data: { errors: response.body.errors },
      failingService,
      gatewayService,
    });
  }
  return response;
}

export async function deleteUsers(userIds: number[]) {
  const url = `${BRAZE_URL}/users/delete`;
  const requestPayload = {
    api_key: BRAZE_KEY,
    external_ids: userIds,
  };

  try {
    const response = await request.post(url).send(requestPayload);
    logger.info('Successfully sent delete request to braze', { body: response.body });
  } catch (err) {
    logger.error('Error deleting user from braze', {
      userId: userIds,
      error: err,
    });

    const logs = userIds.map(user => ({
      userId: user,
      successful: false,
      type: 'BRAZE_DELETE_USER',
      message: `error deleting user from braze`,
    }));
    await AuditLog.bulkCreate(logs);
  }
}

export async function deleteUser(userId: number) {
  return deleteUsers([userId]);
}

export async function exportData(userId: number): Promise<any> {
  const url = `${BRAZE_URL}/users/export/ids`;
  const requestPayload = {
    api_key: BRAZE_KEY,
    external_ids: [userId],
  };

  try {
    const result = await request.post(url).send(requestPayload);
    return result.body;
  } catch (err) {
    logger.error('Error exporting data from braze', { error: ErrorHelper.logFormat(err) });
  }
}

/**
 * @desc Trigger Blaze Campaign
 * @see https://www.braze.com/docs/developer_guide/rest_api/messaging/#sending-messages-via-api-triggered-delivery
 *  POST https://BRAZE_URL/campaigns/trigger/send
 *  Content-Type: application/json
 *  {
 *    "api_key": (required, string) see App Group REST API Key,
 *    "campaign_id": (required, string) see Campaign Identifier,
 *    "send_id": (optional, string) see Send Identifier,
 *    "trigger_properties": (optional, object) personalization key-value pairs that will apply to all users in this request,
 *    "broadcast": (optional, boolean) see Broadcast -- defaults to false on 8/31/17, must be set to true if "recipients" is omitted,
 *    "audience": (optional, Connected Audience Object) see Connected Audience,
 *    // Including 'audience' will only send to users in the audience
 *    "recipients": (optional, array; if not provided and broadcast is not set to 'false', message will send to entire segment targeted by the campaign) [
 *      {
 *        // Either "external_user_id" or "user_alias" is required. Requests must specify only one.
 *        "user_alias": (optional, User Alias Object) User Alias of user to receive message,
 *        "external_user_id": (optional, string) External Id of user to receive message,
 *        "trigger_properties": (optional, object) personalization key-value pairs that will apply to this user (these key-value pairs will override any keys that conflict with trigger_properties above)
 *      },
 *      ...
 *    ]
 *  }
 */
export async function triggerCampaign(data: {
  campaign_id: string;
  send_id?: string;
  trigger_properties?: object;
  broadcast?: boolean;
  audience?: BrazeConnectedAudience;
  recipients?: BrazeRecipient[];
}) {
  const url = `${BRAZE_URL}/campaigns/trigger/send`;
  const requestPayload = {
    api_key: BRAZE_KEY,
    ...transform(
      data,
      getSerialize({
        transformArrays: true,
        transformObjects: true,
      }),
    ),
  };

  const response = await request.post(url).send(requestPayload);
  const { campaign_id: campaignId } = data;
  if (response.body.errors) {
    metrics.increment(BrazeMetrics.BRAZE_TRIGGER_CAMPAIGN_ERROR, { campaignId });
    const message = 'Campaign trigger failed';
    const errorData = {
      data: { errors: response.body.errors },
      failingService,
      gatewayService,
    };
    throw new BrazeError(message, errorData);
  }
  metrics.increment(BrazeMetrics.BRAZE_TRIGGER_CAMPAIGN_SUCCESS, { campaignId });
  return response;
}

function getSerialize(options: { transformObjects?: boolean; transformArrays?: boolean }) {
  const { transformObjects, transformArrays } = options;
  return function serialize(result: { [key: string]: any }, value: any, key: string) {
    if (moment.isMoment(value)) {
      value = value.format();
    } else if (Array.isArray(value) && transformArrays) {
      value = value.map(a => (typeof a === 'string' ? a : transform(a, serialize)));
    } else if (typeof value === 'object' && transformObjects) {
      value = transform(value, serialize);
    }
    const snakeCaseExcludes = ['AND', 'OR'];
    const resultKey = snakeCaseExcludes.indexOf(key) === -1 ? snakeCase(key) : key;
    result[resultKey] = value;
    return result;
  };
}

export default { track, triggerCampaign, deleteUser, deleteUsers, exportData };
