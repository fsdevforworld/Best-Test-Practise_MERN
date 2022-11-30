import { NotFoundError } from '@dave-inc/error-types';
import { Request } from 'express';

import logger from '../../lib/logger';

import { Overrides, isEvent } from './events';
import { integrationMap, integrations } from './integrations';
import metrics, { Metric } from './metrics';
import { Integrations, Platform, TrackBody } from './types';

export function extractHeaders(
  request: Request,
): {
  platform: Platform;
  appsFlyerId: string;
} {
  return {
    appsFlyerId: request.get('X-AppsFlyer-ID'),
    platform: request.get('X-Device-Type') === 'ios' ? 'ios' : 'android',
  };
}

export async function track(body: TrackBody): Promise<void> {
  if (!isEvent(body.event)) {
    throw new NotFoundError(null, { data: { event: body.event } });
  }

  for (const integration of integrations) {
    if (isEnabled(integration, body)) {
      try {
        await integrationMap[integration].track(body);
        metrics.increment(Metric.TrackSuccess, { integration });
      } catch (error) {
        metrics.increment(Metric.TrackFailure, {
          integration,
          statusCode: error.statusCode,
        });
        logger.error('analytics error', { method: 'track', error, integration });
      }
    }
  }
}

function isEnabled(integration: keyof Integrations, body: TrackBody) {
  const flags = getEnableFlags(body);
  return Boolean(flags[integration]);
}

function getEnableFlags(body: TrackBody) {
  const payloadFlags = Object.keys(body.integrations ?? {}).reduce<Record<string, boolean>>(
    (acc, key) => {
      acc[key] = Boolean(body.integrations[key as keyof Integrations]);
      return acc;
    },
    {},
  );

  const overideFlags = Overrides[body.event] ?? {};
  return Object.assign({}, payloadFlags, overideFlags);
}
