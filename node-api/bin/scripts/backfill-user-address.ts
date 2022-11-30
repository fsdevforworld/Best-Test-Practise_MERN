import * as config from 'config';
import { UserAddress } from '../../src/models';
import * as Bluebird from 'bluebird';
import logger from '../../src/lib/logger';
import { runTaskGracefully } from '../../src/lib/utils';
import { getCSVFile } from '../../src/lib/gcloud-storage';

function strip(s: string): string {
  // data in csv for these fields are surrounded by ""
  // remove them before inserting into database
  return s.replace(/^"|"$/g, '');
}

async function createUserAddress(
  record: Record<string, any>,
): Promise<{ id: string; success: boolean }> {
  const dbId = record.DB_ID;

  try {
    await UserAddress.create({
      userId: parseInt(record.USER_ID, 10),
      addressLine1: strip(record.ADDRESS_LINE1),
      addressLine2: strip(record.ADDRESS_LINE2),
      city: strip(record.CITY),
      state: strip(record.STATE),
      zipCode: strip(record.ZIP_CODE),
      created: new Date(record.CREATED),
    });
    return { id: dbId, success: true };
  } catch (e) {
    logger.error(`Error when creating address for ${dbId}`, { e });
    return { id: dbId, success: false };
  }
}

async function run({
  bucketName = config.get('googleCloud.projectId'),
  fileName = 'scripts/backfill-user-address/user_address.csv',
}: {
  bucketName?: string;
  fileName?: string;
} = {}): Promise<void> {
  const rows = await getCSVFile(bucketName, fileName, { columns: true, bom: true });
  if (!rows || rows.length === 0) {
    logger.info('Nothing to create');
    process.exit(0);
  }

  logger.info(`Creating ${rows.length} user_address records`);

  const results = await Bluebird.map(rows, x => createUserAddress(x), {
    concurrency: 5,
  });

  const errorList = [];
  for (const result of results) {
    if (!result.success) {
      errorList.push(result.id);
    }
  }

  if (errorList.length) {
    logger.info('The following addresses were not created', { errorList });
  } else {
    logger.info('All addresses were created successfully');
  }
}

runTaskGracefully(() => run());
