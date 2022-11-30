import ErrorHelper from '@dave-inc/error-helper';
import { BroadcastAdvanceApprovalData, broadcastAdvanceApprovalTask } from '../jobs/data';
import { dogstatsd } from '../lib/datadog-statsd';
import logger from '../lib/logger';
import { Cron, DaveCron } from './cron';
import { NotificationType } from '../models/notification';
import { processInBatches } from '../lib/utils';
import { sequelize } from '../models';
import * as Bluebird from 'bluebird';
import { QueryTypes } from 'sequelize';

const BATCH_SIZE = 100000;

export async function run() {
  return processInBatches(
    (limit: number, offset: number, previous?: BroadcastAdvanceApprovalData[]) => {
      dogstatsd.increment('auto_advance_approval.task_triggered');

      const lastId = previous ? previous[previous.length - 1].bankAccountId : 0;

      const query = `
        SELECT distinct bank_account.id as bankAccountId
        FROM bank_account
                LEFT JOIN advance ON bank_account.user_id = advance.user_id
                INNER JOIN bank_connection ON bank_connection.id = bank_account.bank_connection_id
                INNER JOIN user_notification ON bank_account.user_id = user_notification.user_id
                INNER JOIN notification ON user_notification.notification_id = notification.id
                INNER JOIN user ON user.id = bank_account.user_id
        WHERE (advance.id is null OR advance.outstanding = 0)
          AND bank_account.deleted IS NULL
          AND bank_connection.has_valid_credentials
          AND notification.type = :type
          AND (
            user_notification.sms_enabled = 1 OR
            user_notification.push_enabled = 1 OR
            user_notification.email_enabled = 1
          )
          AND user_notification.deleted IS NULL
          AND user.default_bank_account_id = bank_account.id
          AND bank_account.id > :lastId
        ORDER BY bank_account.id ASC
        LIMIT ${limit}
      `;
      return sequelize.query(query, {
        type: QueryTypes.SELECT,
        replacements: { type: NotificationType.AUTO_ADVANCE_APPROVAL, lastId },
      });
    },
    processBatch,
    BATCH_SIZE,
  );
}

async function processBatch(jobDatas: BroadcastAdvanceApprovalData[], offset: number) {
  await Bluebird.each(jobDatas, async jobData => {
    try {
      await broadcastAdvanceApprovalTask(jobData);
      dogstatsd.increment('auto_advance_approval.accounts_pulled', 1);
    } catch (err) {
      dogstatsd.increment('auto_advance_approval.create_task_failed');
      logger.error('Failed to create broadcast advance approval task', {
        error: ErrorHelper.logFormat(err),
        jobData,
      });
    }
  });
}

export const AutoAdvanceApproval: Cron = {
  name: DaveCron.AutoAdvanceApproval,
  process: run,
  schedule: '0 7 * * *',
};
