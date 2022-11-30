import * as Bluebird from 'bluebird';
import { chunk, uniqBy } from 'lodash';

import { getReporter, getDates, getBulkCreateOptions } from '../../src/lib/appsflyer';
import logger from '../../src/lib/logger';
import { runTaskGracefully } from '../../src/lib/utils';
import { CampaignInfo } from '../../src/models';
import { Platforms } from '../../src/typings';

const args = process.argv;
const from = args[2]; // YYYY-MM-DD
const to = args[3]; // YYYY-MM-DD
const platform: Platforms = (args[4] as Platforms) ?? Platforms.iOS;

const reportType = 'in_app_events_report';
const additionalFields = ['customer_user_id'];
const batchSize = 100;
const processName = 'appsflyer-user-id-backfill';

async function run() {
  const getReports = getReporter(reportType, additionalFields)(platform);
  const dates = getDates(from, to);
  const infoPayload = { processName, platform, from, to };
  logger.info(`${processName} start run task`, infoPayload);
  for (const [start, end] of dates) {
    logger.info(`${processName} start daily`, { ...infoPayload, start, end });
    const reports = await getReports(start, end);
    logger.info(`$${processName} pulled daily`, { ...infoPayload, start, end });
    const mapped = reports
      .filter(record => Boolean(record['Customer User ID']))
      .map(record => ({
        appsflyerDeviceId: record['AppsFlyer ID'],
        userId: record['Customer User ID'],
      }));

    const batches = chunk(uniqBy(mapped, 'appsflyerDeviceId'), batchSize);
    const fields: Array<keyof CampaignInfo> = ['appsflyerDeviceId', 'userId'];
    const createOptions = getBulkCreateOptions(fields, processName);
    for (const [idx, batch] of batches.entries()) {
      await CampaignInfo.bulkCreate(batch, createOptions(idx + 1, batches.length));
      await Bluebird.delay(100);
    }
    logger.info(`${processName} end daily`, { ...infoPayload, start, end });
    await Bluebird.delay(60000); // avoid API throttling
  }
  logger.info(`${processName} end run task`, infoPayload);
}

runTaskGracefully(() => run());
