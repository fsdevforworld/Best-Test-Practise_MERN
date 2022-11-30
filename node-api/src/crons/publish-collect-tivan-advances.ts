import { moment, PACIFIC_TIMEZONE } from '@dave-inc/time-lib';
import * as config from 'config';
import { partial } from 'lodash';

import { dogstatsd } from '../lib/datadog-statsd';
import { concurrentForEach } from '../lib/utils';
import {
  AdvanceRowData,
  getPublishAdvancesParams,
  processPublishableAdvances,
  publishTivanAdvance,
} from '../publishers/publish-collect-advance/task';
import { AdvanceCollectionTrigger } from '../typings';
import { Cron, DaveCron } from './cron';

const TASK_NAME = 'publish_collect_tivan_advances';
const BATCH_SIZE = 10000;
const CONCURRENCY_LEVEL = parseInt(config.get('pubsub.advanceCollectionPublishConcurrency'), 10);

export function tivanBatchProcessor(
  trigger: AdvanceCollectionTrigger,
  advanceRows: AdvanceRowData[],
) {
  return concurrentForEach(
    advanceRows,
    CONCURRENCY_LEVEL,
    async ({ advanceId, isTivanAdvance }) => {
      let startTime;
      // if we are in the previous day schedule for midnight
      if (
        moment()
          .tz(PACIFIC_TIMEZONE)
          .hour() >= 22
      ) {
        startTime = moment()
          .tz(PACIFIC_TIMEZONE)
          .add(1, 'day')
          .startOf('day');
      }
      if (isTivanAdvance) {
        await publishTivanAdvance(advanceId, trigger, { startTime });
      }
    },
  );
}

export async function run() {
  const { minAdvanceAmount, minDate } = getPublishAdvancesParams();

  dogstatsd.increment(`${TASK_NAME}.task_started`);

  await processPublishableAdvances(
    partial(tivanBatchProcessor, AdvanceCollectionTrigger.DAILY_CRONJOB),
    BATCH_SIZE,
    {
      minDate,
      maxDate: moment(),
      minAdvanceAmount,
    },
  );

  dogstatsd.increment(`${TASK_NAME}.task_completed`);
}

export const PublishCollectTivanAdvances: Cron = {
  name: DaveCron.PublishCollectTivanAdvances,
  process: run,
  // 11:45 PM PDT. In PST can leave this at 10:45 PM
  schedule: '45 6 * * *',
};
