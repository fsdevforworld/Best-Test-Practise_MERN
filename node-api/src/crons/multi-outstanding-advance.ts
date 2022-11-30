import ErrorHelper from '@dave-inc/error-helper';
import { NotFoundError } from '@dave-inc/error-types';
import { moment } from '@dave-inc/time-lib';
import { isNil, max } from 'lodash';

import { wrapMetrics } from '../lib/datadog-statsd';
import Snowflake from '../lib/snowflake';
import logger from '../lib/logger';
import { setActiveCollection } from '../domain/active-collection';

import { Cron, DaveCron } from './cron';

const IsDryRun = !isNil(process.env.DRY_RUN);

const enum Metrics {
  RowProcessed = 'multi-outstanding-advance.user-processed',
  RowProcessError = 'multi-outstanding-advance.user-processing-failed',
  RowProcessedSucess = 'multi-outstanding-advance.user-processed',
}

const metrics = wrapMetrics<Metrics>();

type MultiAdvance = {
  USER_ID: number;
  ADVANCES: number[];
  LAST_PAID_ADV: null | number;
  LAST_PAID_OUTSTANDING: null | number;
  LAST_PAID_TIME: null | Date;
};

/* Represents an advance that was paid off within
 * the last 7 days, and while it was not yet paid
 * off, overlapped with other unpaid advances
 */
type PaidOffOverlappingAdvance = {
  advanceId: number;
  outstanding: number;
  paymentTime: Date;
};

const query = `
SELECT
  user_id,
  ARRAY_AGG(DISTINCT advance_id) AS advances,
  COUNT(DISTINCT advance_id) AS num_advances,
  ANY_VALUE(last_paid_adv) AS last_paid_adv,
  ANY_VALUE(last_paid_outstanding) AS last_paid_outstanding,
  MAX(pay_created) AS last_paid_time
FROM
(
  SELECT
    adv.user_id,
    adv.id AS advance_id,
    pay.ADVANCE_ID AS paid_advance,
    pay.created AS pay_created,
    pay_adv.outstanding AS paid_adv_outstanding,
    FIRST_VALUE(pay_adv.id) OVER ( PARTITION BY adv.user_id ORDER BY pay.created DESC ) AS last_paid_adv,
    FIRST_VALUE(pay_adv.outstanding) OVER ( PARTITION BY adv.user_id ORDER BY pay.created DESC ) AS last_paid_outstanding
  FROM APPLICATION_DB.GOOGLE_CLOUD_MYSQL_DAVE.ADVANCE AS adv

  --
  -- look for where payment for another advance overlaps
  --
  LEFT JOIN APPLICATION_DB.GOOGLE_CLOUD_MYSQL_DAVE.PAYMENT AS pay
    ON adv.user_id = pay.user_id
    AND pay.advance_id != adv.id
    AND DATEDIFF(day, pay.created, CURRENT_TIMESTAMP) < 7
    AND adv.created < pay.created
    AND pay.status IN ('PENDING', 'COMPLETED')
  LEFT JOIN APPLICATION_DB.GOOGLE_CLOUD_MYSQL_DAVE.ADVANCE AS pay_adv
    ON pay.ADVANCE_ID = pay_adv.id

  WHERE adv.outstanding > 0
    AND adv.disbursement_status = 'COMPLETED'
)
GROUP BY user_id

--
-- num_advances > 1: captures the multi-outstanding advance case
--
-- num_advances == 1 and last_paid_adv != NULL: captures the case where
--   the previous paid-off advance overlaps the current advance
--
HAVING num_advances > 1
   OR ANY_VALUE(last_paid_adv) IS NOT NULL
ORDER BY num_advances DESC
`;

function getMultiAdvances(): Promise<AsyncIterable<MultiAdvance>> {
  return new Promise((resolve, reject) => {
    Snowflake.stream(query)
      .then((stream: NodeJS.ReadableStream) => {
        resolve(stream as AsyncIterable<MultiAdvance>);
      })
      .catch(reject);
  });
}

/*
 * Called when overlapping advances are detected,
 * sets an active collected advance according to the following:
 *
 * - If advance paid off within last 7 days was an overlapping
 *   advance (lastPaid is defined), that is the active advance.
 *   If fully paid off, set TTL at payment time + 7 days, otherwise
 *   set max TTL
 *
 * - If there are multiple active advances, choose the most
 *   recent one as active, since that is the most likely
 *   to be successfully collected
 *
 */
export async function setUserCollectibleAdvance(
  userId: number,
  activeAdvances: number[],
  lastPaid?: PaidOffOverlappingAdvance,
): Promise<void> {
  let activeAdvance: number | undefined;
  let ttlSec: number | undefined;

  metrics.increment(Metrics.RowProcessed, { hasLastPaid: isNil(lastPaid) ? 'false' : 'true' });

  if (isNil(lastPaid)) {
    if (activeAdvances.length < 2) {
      logger.warn('Unexpected query result: user only has one outstanding advance', {
        userId,
        activeAdvances,
        lastPaid,
      });
      throw new RangeError('Less than 2 active advances');
    } else {
      activeAdvance = max(activeAdvances);
    }
  } else {
    activeAdvance = lastPaid.advanceId;
    if (lastPaid.outstanding === 0) {
      const expiration = moment(lastPaid.paymentTime).add(7, 'days');
      ttlSec = expiration.diff(moment(), 'seconds');
    }
  }

  if (isNil(activeAdvance)) {
    logger.error('No active advances found', {
      userId,
      activeAdvances,
      lastPaid,
    });
    throw new NotFoundError('No active advances found');
  } else if (IsDryRun) {
    logger.info('Dry run, active collection for user:', {
      userId,
      activeAdvance,
      ttlSec,
    });
  } else {
    await setActiveCollection(`${userId}`, `${activeAdvance}`, ttlSec);
  }
}

async function tagMultiAdvances(): Promise<number> {
  const stream = await getMultiAdvances();

  let numRows = 0;
  for await (const row of stream) {
    numRows += 1;
    try {
      let lastPaidAdvance: undefined | PaidOffOverlappingAdvance = undefined;
      if (
        !isNil(row.LAST_PAID_ADV) &&
        !isNil(row.LAST_PAID_OUTSTANDING) &&
        !isNil(row.LAST_PAID_TIME)
      ) {
        lastPaidAdvance = {
          advanceId: row.LAST_PAID_ADV,
          outstanding: row.LAST_PAID_OUTSTANDING,
          paymentTime: row.LAST_PAID_TIME,
        };
      }

      await setUserCollectibleAdvance(row.USER_ID, row.ADVANCES, lastPaidAdvance);
      metrics.increment(Metrics.RowProcessedSucess);
    } catch (error) {
      logger.error('Error marking user multi-advance-collection', {
        error,
        data: row,
      });
      const formatted = ErrorHelper.logFormat(error);
      metrics.increment(Metrics.RowProcessError, {
        error: formatted.errorName,
        message: formatted.errorMessage,
      });
    }
  }

  return numRows;
}

async function main() {
  logger.info('Starting multi-advance tagging job', {
    IsDryRun,
  });

  try {
    const numRows = await tagMultiAdvances();
    logger.info('Finished tagging multi-advances', { numRows });
  } catch (error) {
    logger.error('Error tagging multi-advances', { error });
  } finally {
    logger.info('processing done!');
    Snowflake.disconnect();
  }
}

if (require.main === module) {
  main();
}

export const MultiOutstandingAdvance: Cron = {
  name: DaveCron.MultiOutstandingAdvance,
  process: main,
  // 4 AM PST, 5 AM PDT
  schedule: '* 12 * * *',
  startingDeadlineSeconds: 120,
};
