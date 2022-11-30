import { chunk } from 'lodash';
import * as Bluebird from 'bluebird';
import * as config from 'config';
import logger from '../../src/lib/logger';
import { getCSVFile as gCloudGetCSVFile } from '../../src/lib/gcloud-storage';
import { UserNotification } from '../../src/models';

/**
 * 1) Snowflake query to produce CSV (user_id, marketing_sms_enabled)
 * 2) CSV to database
 * 3) Database to Braze
 *
 * === PART 2: CSV to database ===
 * Query CSV to update user notifications table
 */

const LOG_PREFIX = 'RET-212 CSV to DB';
const bucketName = config.get<string>('googleCloud.projectId');

type Row = { userId: string };
type Update = {
  userId: string;
  notificationId: number;
  smsEnabled: boolean;
};
const MARKETING_IDS = [3, 4, 5];

async function main() {
  logger.info(`${LOG_PREFIX} script start`);
  const userIds = await getCSVFile();
  logger.info(`${LOG_PREFIX} CSV fetched from Google Cloud storage`, { count: userIds.length });

  const rows = userIds.reduce<Update[]>((acc, { userId }) => {
    MARKETING_IDS.forEach(notificationId => acc.push({ userId, notificationId, smsEnabled: true }));
    return acc;
  }, []);

  const rowChunks = chunk(rows, 1000);
  for (let i = 0; i < rowChunks.length; i++) {
    logger.info(`${LOG_PREFIX} processing chunk`, { chunk: i, total: rowChunks.length });
    try {
      await UserNotification.bulkCreate(rowChunks[i], { updateOnDuplicate: ['smsEnabled'] });
      await Bluebird.delay(100);
    } catch (error) {
      logger.error(`${LOG_PREFIX} error processing chunk`, { chunk: i });
      throw error;
    }
  }

  logger.info(`${LOG_PREFIX} script complete`);
}

async function getCSVFile(): Promise<Row[]> {
  const fileName = 'scripts/ret-212-backfill-user-preferences/preferences.csv';
  return gCloudGetCSVFile(bucketName, fileName, { columns: true, bom: true });
}

main()
  .then(() => process.exit())
  .catch(error => {
    logger.error(`${LOG_PREFIX} error`, error);
    process.exit(1);
  });
