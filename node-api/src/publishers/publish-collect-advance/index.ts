import '0-dd-trace-init-first-datadog-enabled';

import { runTaskGracefullyWithMetrics } from '../../lib/utils';
import { getPublishAdvancesParams, publishAdvancesForCollection } from './task';

async function main() {
  const { minAdvanceAmount, minDate } = getPublishAdvancesParams();

  await publishAdvancesForCollection({ minAdvanceAmount, minDate });
}

runTaskGracefullyWithMetrics(main, 'publish-collect-advance');
