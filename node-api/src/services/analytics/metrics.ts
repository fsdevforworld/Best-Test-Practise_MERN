import { wrapMetrics } from '../../lib/datadog-statsd';

export enum Metric {
  TrackSuccess = 'analytics.track.success',
  TrackFailure = 'analytics.track.failure',
}

export default wrapMetrics<Metric>();
