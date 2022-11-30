// tslint:disable-next-line:no-require-imports
import Amplitude = require('amplitude');
import { InvalidParametersError } from '@dave-inc/error-types';
import * as config from 'config';
import { omitBy, isNil, isEmpty } from 'lodash';

import { isTestEnv } from '../../../../lib/utils';
import { TrackBody } from '../../types';
import { EventData, Properties } from './types';

const apiKey = config.get<string>('amplitude.apiKey');
const amplitude = new Amplitude(apiKey);

export async function track(body: TrackBody) {
  const data = validate(body);
  if (isTestEnv()) {
    return;
  }
  return amplitude.track(data);
}

export function validate(body: TrackBody) {
  if (!('userId' in body)) {
    throw new InvalidParametersError(null, {
      required: ['userId'],
      provided: Object.keys(body),
    });
  }

  const { revenue, revenueType, ...properties } = body.properties ?? {};

  return omitBy<EventData>(
    {
      userId: body.userId,
      // device
      deviceId: body.context?.device?.id,
      appVersion: body.context?.app?.version,
      osName: body.context?.os?.name,
      deviceBrand: body.context?.device?.name,
      deviceManufacturer: body.context?.device?.manufacturer,
      deviceModel: body?.context?.device?.model,
      // event
      eventType: body.event,
      userProperties: body.context?.traits,
      eventProperties: !isEmpty(properties) ? (properties as Properties) : null,
      time: body.timestamp,
      sessionId: getSessionIdFromBody(body),
      // revenue
      revenue,
      revenueType,
    },
    isNil,
  ) as EventData;
}

function getSessionIdFromBody(body: TrackBody) {
  const integration = body?.integrations?.Amplitude;
  if (typeof integration === 'boolean') {
    return undefined;
  }
  return integration?.session_id;
}
