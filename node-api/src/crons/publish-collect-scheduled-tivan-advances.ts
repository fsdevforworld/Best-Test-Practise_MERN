import { moment, PACIFIC_TIMEZONE } from '@dave-inc/time-lib';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import * as config from 'config';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../models';

import { concurrentForEach, processInBatches } from '../lib/utils';
import { AdvanceRowData, publishTivanAdvance } from '../publishers/publish-collect-advance/task';
import { Cron, DaveCron } from './cron';
import { AdvanceCollectionTrigger } from '../typings';

const BATCH_SIZE = 10000;
const CONCURRENCY_LEVEL = parseInt(config.get('pubsub.advanceCollectionPublishConcurrency'), 10);

export function tivanBatchProcessor(advanceRows: AdvanceRowData[]) {
  return concurrentForEach(
    advanceRows,
    CONCURRENCY_LEVEL,
    async ({ advanceId, isTivanAdvance }) => {
      if (isTivanAdvance) {
        const startTime = moment()
          .tz(PACIFIC_TIMEZONE, true)
          .startOf('day')
          .add(6, 'hours');
        await publishTivanAdvance(advanceId, AdvanceCollectionTrigger.PAYDAY_CATCHUP, {
          startTime,
        });
      }
    },
  );
}

export async function run() {
  const date = moment().ymd();
  return processInBatches(
    (limit: number, offset: number, previous?: AdvanceRowData[]) => {
      const lastId = previous ? previous[previous.length - 1].advanceId : 0;

      return sequelize.query(
        `
        SELECT a.id as advanceId, ANY_VALUE(ab.id) IS NOT NULL as isTivanAdvance
        FROM advance a
        -- Check that has a collection schedule
        INNER JOIN advance_collection_schedule acs ON acs.advance_id = a.id
        LEFT JOIN ab_testing_event ab ON ab.event_uuid = a.id and ab.event_name = 'TIVAN_REPAYMENT'
        WHERE a.payback_date < NOW()
            AND a.outstanding > 0
            AND a.payback_frozen = false
            AND a.disbursement_status = '${ExternalTransactionStatus.Completed}'
            -- make sure we have a schedule advance window
            AND acs.window_start >= :date
            AND acs.window_end <= :date
          -- For batching
          AND a.id > :lastId
        GROUP BY a.id
        ORDER BY a.id
        LIMIT ${limit}
          `,
        {
          type: QueryTypes.SELECT,
          replacements: { date, lastId },
        },
      );
    },
    tivanBatchProcessor,
    BATCH_SIZE,
  );
}

export const PublishCollectScheduledTivanAdvances: Cron = {
  name: DaveCron.PublishCollectScheduledTivanAdvances,
  process: run,
  schedule: '0 7,9,11,15,19,22 * * *',
};
