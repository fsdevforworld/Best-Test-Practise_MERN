import { IOptions } from '@dave-inc/google-cloud-tasks-helpers';
import { moment } from '@dave-inc/time-lib';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import * as config from 'config';
import { Moment } from 'moment';
import { QueryTypes } from 'sequelize';

import { COMPLIANCE_EXEMPT_TRIGGERS } from '../../domain/advance-collection-engine/rules';
import { MAX_COLLECTION_ATTEMPTS } from '../../domain/collection';
import { collectAdvanceDailyAutoRetrieveEvent } from '../../domain/event';
import * as Repayment from '../../domain/repayment';
import { dogstatsd } from '../../lib/datadog-statsd';
import logger from '../../lib/logger';
import { concurrentForEach, processInBatches } from '../../lib/utils';
import { Advance, sequelize } from '../../models';
import { AdvanceCollectionTrigger, BooleanValue } from '../../typings';

const TASK_NAME = 'publish_collect_advance';
const CONCURRENCY_LEVEL = parseInt(config.get('pubsub.advanceCollectionPublishConcurrency'), 10);
const BATCH_SIZE = 10000;

export type AdvanceRowData = { advanceId: number; isTivanAdvance: boolean };
export type AdvanceBatchProcessor = (advanceRows: AdvanceRowData[]) => Promise<void>;

export type PublishAdvanceQueryOptions = {
  minDate?: Moment;
  maxDate?: Moment;
  minAdvanceAmount?: number;
};

export function getPublishAdvancesParams() {
  let minAdvanceAmount;
  // DAILY_AUTO_RETRIEVE_MIN_AMOUNT is set in staging
  if (process.env.DAILY_AUTO_RETRIEVE_MIN_AMOUNT) {
    minAdvanceAmount = parseInt(process.env.DAILY_AUTO_RETRIEVE_MIN_AMOUNT, 10);
  } else {
    minAdvanceAmount = moment().hour() < 12 ? 0 : 25;
  }
  logger.info('Specifying minimum advance collection amount', { minAdvanceAmount });

  let minDate = moment().subtract(1, 'days');

  if (moment().day() === 1) {
    // run Friday's collections again on Monday because Monday
    // is the next business day after Friday
    minDate = moment().subtract(3, 'days');
  }

  return { minDate, minAdvanceAmount };
}

export async function publishTivanAdvance(
  advanceId: number,
  trigger: AdvanceCollectionTrigger = AdvanceCollectionTrigger.DAILY_CRONJOB,
  options: IOptions = {},
) {
  const advance = await Advance.findByPk(advanceId);
  await Repayment.createAdvanceRepaymentTask(advance, trigger, options);
}

function defaultBatchProcessor(advanceRows: AdvanceRowData[]) {
  return concurrentForEach(
    advanceRows,
    CONCURRENCY_LEVEL,
    async ({ advanceId, isTivanAdvance }) => {
      try {
        dogstatsd.increment(`${TASK_NAME}.count_of_outstanding_advances`);

        if (isTivanAdvance) {
          if (process.env.PUBLISH_TIVAN_ADVANCES !== BooleanValue.False) {
            await publishTivanAdvance(advanceId, AdvanceCollectionTrigger.DAILY_CRONJOB);
          }
        } else {
          await collectAdvanceDailyAutoRetrieveEvent.publish({ advanceId });
        }
      } catch (ex) {
        logger.error('Error while publishing', { ex });
        dogstatsd.increment(`${TASK_NAME}.error_encountered_while_publishing`, {
          reason: 'publish_error',
        });
      }
    },
  );
}

export async function publishAdvancesForCollection({
  minAdvanceAmount: minAdvanceAmount = 0,
  minDate: minDate = moment().subtract(1, 'days'),
  maxDate: maxDate = moment(),
  processBatch = defaultBatchProcessor,
}: {
  minAdvanceAmount?: number;
  minDate?: Moment;
  maxDate?: Moment;
  processBatch?: AdvanceBatchProcessor;
} = {}) {
  dogstatsd.increment(`${TASK_NAME}.task_started`);

  await processPublishableAdvances(processBatch, BATCH_SIZE, {
    minDate,
    maxDate,
    minAdvanceAmount,
  });

  dogstatsd.increment(`${TASK_NAME}.task_completed`);
}

function getComplianceExemptTriggers() {
  return COMPLIANCE_EXEMPT_TRIGGERS.map(trigger => `'${trigger}'`).join(', ');
}

export function processPublishableAdvances(
  processBatch: AdvanceBatchProcessor,
  batchSize: number = BATCH_SIZE,
  {
    minAdvanceAmount = 0,
    minDate = moment().subtract(1, 'days'),
    maxDate = moment(),
  }: PublishAdvanceQueryOptions,
) {
  return processInBatches(
    (limit: number, offset: number, previous?: AdvanceRowData[]) => {
      const lastId = previous ? previous[previous.length - 1].advanceId : 0;

      return sequelize.query(
        `
        SELECT
          a.id as advanceId,
          ANY_VALUE(ab.id) IS NOT NULL as isTivanAdvance
        FROM advance a
        -- Check tivan advances
        LEFT JOIN ab_testing_event ab ON ab.event_uuid = a.id and ab.event_name = 'TIVAN_REPAYMENT'
        -- Successful Collection Attempts
        LEFT JOIN advance_collection_attempt aca
          ON aca.advance_id = a.id
          AND aca.\`trigger\` NOT IN (${getComplianceExemptTriggers()})
        LEFT JOIN payment p
          ON aca.payment_id = p.id
          AND p.status in ('${ExternalTransactionStatus.Completed}', '${
          ExternalTransactionStatus.Pending
        }')
          AND p.deleted IS NULL

          -- Advance criteria
          WHERE a.payback_date BETWEEN ? AND ?
            AND a.amount >= ?
            AND a.outstanding > 0
            AND a.payback_frozen = false
            AND a.disbursement_status = '${ExternalTransactionStatus.Completed}'

          -- For batching
          AND a.id > ${lastId}

          -- Performance improvement to give first batch a lower bound on id
          AND a.id > IFNULL((
            SELECT id
            FROM advance
            WHERE payback_date = DATE_SUB(?, INTERVAL 30 DAY)
            ORDER BY id DESC
            LIMIT 1), 0)

        GROUP BY a.id
        HAVING COUNT(p.id) < ${MAX_COLLECTION_ATTEMPTS}
        ORDER BY a.id
        LIMIT ${limit}
          `,
        {
          type: QueryTypes.SELECT,
          replacements: [
            minDate.format('YYYY-MM-DD'),
            maxDate.format('YYYY-MM-DD'),
            minAdvanceAmount,
            minDate.format('YYYY-MM-DD'),
          ],
        },
      );
    },
    processBatch,
    batchSize,
  );
}
