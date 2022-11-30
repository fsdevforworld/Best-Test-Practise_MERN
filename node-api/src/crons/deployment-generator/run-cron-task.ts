import '0-dd-trace-init-first-datadog-enabled';

import { runTaskGracefully } from '../../lib/utils';
import { crons } from '../index';
import { dogstatsd } from '../../lib/datadog-statsd';
import * as moment from 'moment';
import logger from '../../lib/logger';

const DD_TAG = 'cron.runner';

async function run() {
  const jobName = process.argv[2];
  const log = (status: string, extra?: { [key: string]: any }) => {
    logger.info(DD_TAG, { jobName, status, ...extra });
    dogstatsd.increment(DD_TAG, { jobName, status });
  };
  if (!jobName) {
    dogstatsd.increment('cron.runner.invalid_cron_name');
    throw new Error('Job Name is Required for cron runner');
  }

  const job = crons.find(c => c.name === jobName);
  if (!job) {
    dogstatsd.increment('cron.runner.no_job_found', {
      jobName,
    });
    throw new Error(`Job Not Found With Name: ${jobName}`);
  }
  const start = moment();

  try {
    log('started');
    await job.process();
    log('finished', { durationSeconds: moment().diff(start, 'seconds') });
  } catch (error) {
    log('errored', { error, durationSeconds: moment().diff(start, 'seconds') });
    // We want the kube task to exit with an error code
    throw error;
  }
}

runTaskGracefully(run);
