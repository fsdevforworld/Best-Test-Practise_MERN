import '0-dd-trace-init-first-datadog-enabled';
import { startDebugger } from '../../lib/utils';

import * as debugAgent from '@google-cloud/debug-agent';
import { Managers } from '../../jobs';

startDebugger(debugAgent, 'job-processor');

Managers.forEach(manager => {
  manager.queue.process('*', manager.concurrency, manager.process);
});
