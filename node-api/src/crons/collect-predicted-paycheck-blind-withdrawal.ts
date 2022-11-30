import { streamQuery } from '../lib/sequelize-helpers';
import { performPredictedPaycheckCollection, PredictedPaycheckCollectionData } from '../jobs/data';
import { Cron, DaveCron } from './cron';
import logger from '../lib/logger';

const CONCURRENCY_RATE = 100;

export async function run() {
  try {
    logger.info('Starting task');

    let rowCount = 0;
    await streamQuery(
      `
        SELECT
          advance.id as advanceId,
          bank_account.id as bankAccountId,
          recurring_transaction.id as recurringTransactionId
        FROM advance
        INNER JOIN bank_account ON bank_account.id = advance.bank_account_id
        INNER JOIN bank_connection ON bank_connection.id = bank_account.bank_connection_id
        INNER JOIN recurring_transaction ON recurring_transaction.id = bank_account.main_paycheck_recurring_transaction_id
        WHERE
          outstanding > 0 AND
          payback_date <= DATE_SUB(CURDATE(), INTERVAL 14 DAY) AND
          payback_frozen = false AND
          bank_connection.has_valid_credentials = false AND
          disbursement_status = 'COMPLETED' AND
          (recurring_transaction.missed IS NULL OR recurring_transaction.missed > bank_connection.last_pull) AND
          recurring_transaction.transaction_display_name != ''
      `,
      async (rowData: PredictedPaycheckCollectionData) => {
        try {
          if (!rowData) {
            logger.error(`Invalid result for publish predicted paycheck blind withdrawal.`);
            return;
          }
          await performPredictedPaycheckCollection(rowData);
          rowCount++;
        } catch (ex) {
          logger.error('Error publishing predicted paycheck blind withdrawal', { ex });
        }
      },
      CONCURRENCY_RATE,
    );

    logger.info(`Published ${rowCount} advances`);
  } catch (ex) {
    logger.error('Error publishing advances', { ex });
  }
}

export const CollectPredictedPaycheckBlindWithdrawal: Cron = {
  name: DaveCron.CollectPredictedPaycheckBlindWithdrawal,
  process: run,
  schedule: '0 13 * * *',
};
