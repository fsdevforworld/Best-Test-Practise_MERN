import { Moment } from 'moment';
import { QueryTypes } from 'sequelize';

import { dogstatsd } from '../../src/lib/datadog-statsd';
import { moment } from '@dave-inc/time-lib';
import { sequelize } from '../../src/models';
import { concurrentForEach, processInBatches } from '../../src/lib/utils';

import { MAX_COLLECTION_ATTEMPTS } from '../../src/domain/collection';
import { collectAdvanceNoOverdraftEvent } from '../../src/domain/event';
import { COMPLIANCE_EXEMPT_TRIGGERS } from '../../src/domain/advance-collection-engine/rules';

import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { Cron, DaveCron } from './cron';
import logger from '../lib/logger';

const TASK_NAME = 'publish-collect-no-overdraft-advance';
const CONCURRENCY_LEVEL = 500;
const BATCH_SIZE = 10000;

const NO_OVERDRAFT_ACCOUNT_INSTITUTION_IDS = [
  104812, // Chime Bank
  268940, // Chime
  267775, // Varo
];

type AdvanceRowData = { advanceId: number };

function processBatch(advanceRows: AdvanceRowData[]) {
  return concurrentForEach(advanceRows, CONCURRENCY_LEVEL, async ({ advanceId }) => {
    try {
      dogstatsd.increment(`${TASK_NAME}.count_of_outstanding_advances`);
      await collectAdvanceNoOverdraftEvent.publish({ advanceId });
    } catch (ex) {
      logger.error('Error while publishing', { ex });
      dogstatsd.increment(`${TASK_NAME}.error_encountered_while_publishing`, {
        reason: 'publish_error',
      });
    }
  });
}

async function run({ today = moment() }: { today?: Moment } = {}) {
  dogstatsd.increment(`${TASK_NAME}.task_started`);

  await processInBatches(
    (limit: number, _offset: number, previous?: AdvanceRowData[]) => {
      const lastId = previous ? previous[previous.length - 1].advanceId : 0;

      return sequelize.query(
        `
        SELECT
          a.id as advanceId
        FROM advance a
        -- Join Institution Data
        INNER JOIN bank_account ba ON
          ba.id = a.bank_account_id
        INNER JOIN bank_connection bc ON
          bc.id = ba.bank_connection_id AND
          bc.has_valid_credentials = true
        INNER JOIN institution inst ON
          inst.id = bc.institution_id
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
          WHERE a.payback_date = ?
            AND a.outstanding > 0
            AND a.disbursement_status = '${ExternalTransactionStatus.Completed}'
            AND inst.id IN (${NO_OVERDRAFT_ACCOUNT_INSTITUTION_IDS.join(', ')})
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
          replacements: [today.format('YYYY-MM-DD'), today.format('YYYY-MM-DD')],
        },
      );
    },
    processBatch,
    BATCH_SIZE,
  );

  dogstatsd.increment(`${TASK_NAME}.task_completed`);
}

function getComplianceExemptTriggers() {
  return COMPLIANCE_EXEMPT_TRIGGERS.map(trigger => `'${trigger}'`).join(', ');
}

export const PublishCollectNoOverdraftAdvance: Cron = {
  name: DaveCron.PublishCollectNoOverdraftAdvance,
  process: run,
  schedule: '0 7 * * *',
};
