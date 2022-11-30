import '0-dd-trace-init-first-datadog-enabled';
import * as config from 'config';
import logger from '../../../lib/logger';
import { runTaskGracefullyWithMetrics } from '../../../lib/utils';
import { createDirectoryClient } from '../lib/directory-api';
import { syncAllRoles } from '../domain/sync-roles';

async function run() {
  const keyFile = config.get<string>('directoryApi.keyFilePath');
  if (!keyFile) {
    throw new Error('No keyFile found');
  }

  const directoryApi = createDirectoryClient(keyFile);

  const results = await syncAllRoles(directoryApi);

  logger.info('Finished internal roles sync', {
    results,
  });
}

runTaskGracefullyWithMetrics(run, 'sync-internal-roles');
