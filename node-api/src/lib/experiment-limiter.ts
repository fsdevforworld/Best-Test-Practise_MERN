import { ILimiter } from '@dave-inc/experiment';
import Counter from './counter';
import { wrapMetrics } from '../../src/lib/datadog-statsd';

const enum Metrics {
  RemainingLimit = 'experiments.limit.remaining',
}

const metrics = wrapMetrics<Metrics>();

// This a temporary solution until Counter is extracted into a library and can be used in '@dave-inc/experiment'
export function buildLimiter(name: string, limit: number): ILimiter {
  const counter = new Counter(`${name}_experiment_limiter`);

  const metricTags = { experiment: name };

  return {
    async withinLimit(): Promise<boolean> {
      const currentCount = await counter.getValue();
      metrics.gauge(Metrics.RemainingLimit, limit - currentCount, metricTags);
      return currentCount < limit;
    },

    async increment(amount: number = 1): Promise<void> {
      await counter.increment(amount);
    },
  };
}

export async function cleanupLimiter(name: string): Promise<void> {
  const counter = new Counter(`${name}_experiment_limiter`);
  await counter.destroy();
}
