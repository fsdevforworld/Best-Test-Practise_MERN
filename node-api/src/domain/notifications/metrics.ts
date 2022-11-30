import { wrapMetrics } from '../../lib/datadog-statsd';

export const enum NotificationMetrics {
  AMPLITUDE_ATTRIBUTE_CREATED = 'notification.amplitude_attribute.created',
  AMPLITUDE_EVENT_CREATED = 'notification.amplitude_event.created',
  BRAZE_ATTRIBUTE_CREATED = 'notification.braze_attribute.created',
  BRAZE_EVENT_CREATED = 'notification.braze_event.created',
  CREATE_MARKETING_ATTRIBUTE_FAILURE = 'braze.create_marketing_attribute.failure',
  CREATE_MARKETING_EVENT_FAILURE = 'braze.create_marketing_event.failure',
  EVENT_NOT_CREATED = 'notification.braze_event.not_created',
  MARKETING_ATTRIBUTE_CREATED = 'notification.marketing_attribute.created',
  MARKETING_EVENT_CREATED = 'notification.marketing_event.created',
}

export const metrics = wrapMetrics<NotificationMetrics>();
