import ErrorHelper from '@dave-inc/error-helper';
import { isArray, isEmpty } from 'lodash';
import braze from '../../lib/braze';
import { dogstatsd } from '../../lib/datadog-statsd';
import logger from '../../lib/logger';
import { moment } from '@dave-inc/time-lib';
import {
  BrazeEvent,
  BrazeUpdateAttributes,
  BrazeUpdateEvent,
  BrazeUserAttributes,
} from '../../typings';

export async function updateBraze({
  userId,
  attributes,
  eventProperties,
}: {
  userId: number;
  attributes?: BrazeUpdateAttributes;
  eventProperties?: BrazeUpdateEvent | BrazeUpdateEvent[];
}) {
  if (!userId || (isEmpty(attributes) && isEmpty(eventProperties))) {
    dogstatsd.increment('update_braze_task.incomplete_payload');
    logger.error('Incomplete payload for updateBraze task', {
      userId,
      attributes,
      eventProperties,
    });
    return;
  }

  const daveToBrazeKeyMap: { [index: string]: string } = {
    phoneNumber: 'phone',
    birthdate: 'dob',
    city: 'home_city',
  };

  const finalPayload: { attributes?: BrazeUserAttributes[]; events?: BrazeEvent[] } = {};

  if (!isEmpty(attributes)) {
    const attributesPayload: BrazeUserAttributes = { externalId: `${userId}` };
    for (const [key, value] of Object.entries(attributes)) {
      const brazeKey: string = daveToBrazeKeyMap[key] || key;
      attributesPayload[brazeKey] = value;
    }
    finalPayload.attributes = [attributesPayload];
  }

  if (!isEmpty(eventProperties)) {
    const events: BrazeUpdateEvent[] = isArray(eventProperties)
      ? eventProperties
      : [eventProperties];
    const eventsPayload: BrazeEvent[] = events.map(eventPayloadProperties => ({
      time: moment(),
      externalId: `${userId}`,
      ...eventPayloadProperties,
    }));
    finalPayload.events = eventsPayload;
  }

  dogstatsd.increment('update_braze_task.start');
  try {
    await braze.track(finalPayload);
  } catch (e) {
    const formattedError = ErrorHelper.logFormat(e);
    dogstatsd.increment('update_braze_task.error');
    logger.error('Update braze task failed', { error: formattedError, userId });
    throw e;
  }
  dogstatsd.increment('update_braze_task.complete');
}
