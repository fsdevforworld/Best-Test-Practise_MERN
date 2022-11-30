import { Moment } from 'moment';

import ErrorHelper from '@dave-inc/error-helper';

import amplitude from '../../lib/amplitude';
import braze from '../../lib/braze';
import { metrics, NotificationMetrics } from './metrics';
import { BrazeError } from '../../lib/error';
import logger from '../../lib/logger';
import { moment } from '@dave-inc/time-lib';

import { AnalyticsEvent, BrazeProperties } from '../../typings';

type MarketingUserProperties = {
  [key: string]: any;
};

export async function createMarketingEventsForUser(
  userId: string,
  eventName: AnalyticsEvent,
  properties?: BrazeProperties,
  time: Moment = moment(),
) {
  const createBrazeEvent = braze.track({
    events: [
      {
        name: eventName,
        externalId: userId,
        properties,
        time,
      },
    ],
  });

  const createAmplitudeEvent = amplitude.track({
    eventType: eventName,
    userId,
    eventProperties: properties,
    time: time.format('YYYY-MM-DD HH:mm:ss'),
  });

  try {
    await Promise.all([createBrazeEvent, createAmplitudeEvent]);
    metrics.increment(NotificationMetrics.BRAZE_EVENT_CREATED, { eventName });
    metrics.increment(NotificationMetrics.AMPLITUDE_EVENT_CREATED, { eventName });
  } catch (error) {
    metrics.increment(NotificationMetrics.CREATE_MARKETING_EVENT_FAILURE);
    if (error instanceof BrazeError) {
      logger.error('Error sending user events to Braze', { ex: error });
    } else {
      logger.error('Error sending events to amplitude', ErrorHelper.logFormat(error));
    }
  }
}

export async function createMarketingAttributesForUser(
  userId: string,
  userProps?: MarketingUserProperties,
) {
  const createBrazeUserAttribute = braze.track({
    attributes: [{ externalId: userId, ...userProps }],
  });

  const createAmplitudeUserAttribute = amplitude.identify({
    user_id: userId,
    user_properties: {
      $set: userProps,
    },
  });

  try {
    await Promise.all([createBrazeUserAttribute, createAmplitudeUserAttribute]);
    metrics.increment(NotificationMetrics.BRAZE_ATTRIBUTE_CREATED);
    metrics.increment(NotificationMetrics.AMPLITUDE_ATTRIBUTE_CREATED);
  } catch (error) {
    metrics.increment(NotificationMetrics.CREATE_MARKETING_ATTRIBUTE_FAILURE);
    if (error instanceof BrazeError) {
      logger.error('Error sending user attribute to Braze', { ex: error });
    } else {
      logger.error('Error sending user attributes to Amplitude', ErrorHelper.logFormat(error));
    }
  }
}
