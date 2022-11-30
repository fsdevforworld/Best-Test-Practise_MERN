import * as Bluebird from 'bluebird';
import { QueryTypes } from 'sequelize';
import { moment } from '@dave-inc/time-lib';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { sequelize, AdvanceCollectionSchedule } from '../models';
import { dogstatsd } from '../lib/datadog-statsd';
import logger from '../lib/logger';
import { processInBatches, runTaskGracefully } from '../lib/utils';
import { Cron, DaveCron } from './cron';

const BATCH_SIZE = 100;

function getMinOriginalPaybackDate(): string {
  if (process.env.MIN_PAYBACK_DATE) {
    return process.env.MIN_PAYBACK_DATE;
  } else {
    const minPaybackDate = moment()
      .subtract(60, 'day')
      .ymd();
    return minPaybackDate;
  }
}

function getMaxIncomeDate(): string {
  if (process.env.MAX_INCOME_DATE) {
    return process.env.MAX_INCOME_DATE;
  } else {
    // don't go past this friday
    const maxIncomeDate =
      moment().weekday() >= 5
        ? moment()
            .add(1, 'week')
            .weekday(5)
            .ymd()
        : moment()
            .weekday(5)
            .ymd();
    return maxIncomeDate;
  }
}

type AdvanceData = { userId: number; advanceId: number; expectedDate: string };

async function processBatch(results: AdvanceData[]) {
  await Bluebird.map(results, async ({ advanceId, expectedDate }) => {
    dogstatsd.increment('scheduling_advance.tivan_overdue');
    await AdvanceCollectionSchedule.create({
      windowStart: expectedDate,
      windowEnd: expectedDate,
      advanceId,
    });
  });
}

export async function main() {
  const minPaybackDate = getMinOriginalPaybackDate();
  const maxIncomeDate = getMaxIncomeDate();
  logger.info('Scheduling past due advances', {
    minPaybackDate,
    maxIncomeDate,
  });

  return processInBatches(
    (limit: number, _offset: number, previous?: AdvanceData[]) => {
      const lastId = previous ? previous[previous.length - 1].userId : 0;

      // this query assumes the `maxIncomedate` would only capture
      // one expected paycheck into the future for a user
      return sequelize.query(
        `
        SELECT
          a.user_id AS userId,
          ANY_VALUE(a.id) AS advanceId,
          ANY_VALUE(et.expected_date) AS expectedDate
        FROM advance a
        INNER JOIN bank_account ba
            ON a.bank_account_id = ba.id
        -- Check we have an active recurring transaction income this week
        INNER JOIN recurring_transaction rt
            ON ba.id = rt.bank_account_id
            AND rt.status = 'VALID'
            AND rt.missed IS NULL
            AND rt.user_amount > 200
        INNER JOIN expected_transaction et
            ON rt.id = et.recurring_transaction_id
            AND et.deleted IS NULL
            AND et.expected_date > NOW()
            AND expected_date <= :maxIncomeDate
        -- Advance criteria
        WHERE a.payback_date < NOW()
            AND a.payback_date >= :minPaybackDate
            AND a.outstanding > 0
            AND a.payback_frozen = false
            AND a.disbursement_status = '${ExternalTransactionStatus.Completed}'
          -- For batching
          AND a.user_id > :lastId
        GROUP BY a.user_id
        ORDER BY a.user_id
        LIMIT ${limit}
          `,
        {
          type: QueryTypes.SELECT,
          replacements: { minPaybackDate, maxIncomeDate, lastId },
        },
      );
    },
    processBatch,
    BATCH_SIZE,
  );
}

export const SchedulePaydayPastDueRepayment: Cron = {
  name: DaveCron.SchedulePaydayPastDueRepayment,
  process: async () => runTaskGracefully(main),
  // midday Sunday
  schedule: '0 20 * * 0',
};
