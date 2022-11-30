import HeathClient from '../lib/heath-client';
import redisClient from '../lib/redis';
import { wrapMetrics } from '../lib/datadog-statsd';
import logger from '../lib/logger';
import { Cron, DaveCron } from './cron';

enum Metrics {
  Started = 'get_read_replica_lag.started',
  Finished = 'get_read_replica_lag.finished',
  Error = 'get_read_replica_lag.error',
  LagValue = 'get_read_replica_lag.value',
}

const metrics = wrapMetrics<Metrics>();

export const ReplicaLagKey = 'read-replica-lag-seconds';

const CacheTTL = 300; // 5 minutes

export async function run() {
  metrics.increment(Metrics.Started);
  try {
    const { replicationLagSeconds } = await HeathClient.getReplicaLag();

    await redisClient.setexAsync(ReplicaLagKey, CacheTTL, replicationLagSeconds);

    metrics.gauge(Metrics.LagValue, replicationLagSeconds);
    metrics.increment(Metrics.Finished);
  } catch (error) {
    metrics.increment(Metrics.Error);
    logger.error('Error getting read replica lag', { error });
  }
}

export const FetchAndStoreReadReplicaLag: Cron = {
  name: DaveCron.FetchAndStoreReadReplicaLag,
  process: run,
  schedule: '* * * * *',
};
