import * as Bluebird from 'bluebird';

import { identity, pickBy, chunk } from 'lodash';
import { CampaignInfo, CampaignInfoContributor } from '../models';
import { moment } from '@dave-inc/time-lib';
import { RawReportRecord } from '../typings/appsflyer';
import {
  getNormalizedNetwork,
  getReporter,
  getBulkCreateOptions,
  getDates,
} from '../lib/appsflyer';
import { Platforms } from '../typings';

import { Cron, DaveCron } from './cron';
import logger from '../lib/logger';

type Processor = (records: RawReportRecord[], batchSize: number) => Promise<void>;

type ProcessInfo = {
  reportType: string;
  processors: Processor[];
  additionalFields?: string[];
};

interface IProcessMap {
  [key: string]: ProcessInfo;
}

type Options = {
  step?: number;
  delay?: number;
};

const DEFAULT_OPTIONS = {
  step: 3,
  delay: 60000,
  batchSize: 256,
};

export enum TaskName {
  uninstall = 'uninstall',
  install = 'install',
}

const ANDROID_UNINSTALL_NUM_DAYS = 1;

// AppsFlyer iOS uninstall event data depends on Apple Push Notification Service (APN). Due to privacy considerations, APNs will not report when a user removes an app right away. As of Feb 26, 2019, APN only returns results for uninstalls after 8 days from the time of install. All uninstall data is available from day 8 and onwards.
// https://support.appsflyer.com/hc/en-us/articles/210289286#ios-uninstall-8-viewing-uninstall-data-in-the-appsflyer-dashboard
const IOS_UNINSTALL_NUM_DAYS = 8;

const INSTALL_NUM_DAYS = 1;

const processMap: IProcessMap = {
  [TaskName.uninstall]: {
    reportType: 'uninstall_events_report',
    processors: [saveUninstallData],
  },
  [TaskName.install]: {
    reportType: 'installs_report',
    additionalFields: [
      'contributor1_media_source',
      'contributor2_media_source',
      'contributor3_media_source',
      'contributor1_campaign',
      'contributor2_campaign',
      'contributor3_campaign',
      'contributor1_touch_type',
      'contributor2_touch_type',
      'contributor3_touch_type',
      'contributor1_touch_time',
      'contributor2_touch_time',
      'contributor3_touch_time',
    ],
    processors: [saveContributorData, saveCampaignId],
  },
};

function runAllTasks() {
  const toDate: string = moment()
    .subtract(1, 'days')
    .format('YYYY-MM-DD');
  const androidUninstallFrom: string = moment(toDate)
    .subtract(ANDROID_UNINSTALL_NUM_DAYS, 'days')
    .format('YYYY-MM-DD');
  const iOSUninstallFrom: string = moment(toDate)
    .subtract(IOS_UNINSTALL_NUM_DAYS, 'days')
    .format('YYYY-MM-DD');
  const installFrom: string = moment(toDate)
    .subtract(INSTALL_NUM_DAYS, 'days')
    .format('YYYY-MM-DD');
  return runTask(TaskName.uninstall, Platforms.Android, androidUninstallFrom, toDate)
    .then(() => runTask(TaskName.uninstall, Platforms.iOS, iOSUninstallFrom, toDate))
    .then(() => runTask(TaskName.install, Platforms.Android, installFrom, toDate))
    .then(() => runTask(TaskName.install, Platforms.iOS, installFrom, toDate));
}

export async function runTask(
  key: TaskName,
  platform: Platforms,
  from: string,
  to: string,
  options?: Options,
) {
  const { delay, step, batchSize } = { ...DEFAULT_OPTIONS, ...options };
  const dates = getDates(from, to, step);
  const { reportType, processors, additionalFields } = processMap[key];
  const infoPayload = { platform, from, to };
  const getReports = getReporter(reportType, additionalFields)(platform);
  logger.info(`${reportType} start run task`, infoPayload);
  for (const [start, end] of dates) {
    logger.info(`${reportType} start daily`, { ...infoPayload, start, end });
    await Bluebird.delay(delay); // Per our representative at AppsFlyer, wait 1 minute to avoid API throttling
    const reports = await getReports(start, end);
    logger.info(`${reportType} pulled daily`, { ...infoPayload, start, end });
    for (const processor of processors) {
      await processor(reports, batchSize);
    }
    logger.info(`${reportType} end daily`, { ...infoPayload, start, end });
  }
  logger.info(`${reportType} emd run task`, infoPayload);
}

/**
 * Facebook uses fb_campaign_id from PUSH API
 * Other networks use campaign_id from PULL API
 **/
async function saveCampaignId(records: RawReportRecord[], batchSize: number) {
  const fields: Array<keyof CampaignInfo> = ['appsflyerDeviceId', 'campaignId'];
  const options = getBulkCreateOptions(fields, 'saveCampaignId');
  const mapped = records
    .filter(
      record =>
        record['Campaign ID'] && getNormalizedNetwork(record['Media Source']) !== 'Facebook',
    )
    .map(record => ({
      appsflyerDeviceId: record['AppsFlyer ID'],
      campaignId: record['Campaign ID'],
      platform: record.Platform,
    }));
  const batches = chunk(mapped, batchSize);
  for (const [idx, batch] of batches.entries()) {
    await CampaignInfo.bulkCreate(batch, options(idx + 1, batches.length));
  }
}

async function saveUninstallData(records: RawReportRecord[], batchSize: number) {
  const fields: Array<keyof CampaignInfo> = ['appsflyerDeviceId', 'appsflyerUninstalledDate'];
  const options = getBulkCreateOptions(fields, 'saveUninstallData');
  const mapped = records.map(record => ({
    appsflyerDeviceId: record['AppsFlyer ID'],
    appsflyerUninstalledDate: record['Event Time'],
    platform: record.Platform,
  }));
  const batches = chunk(mapped, batchSize);
  for (const [idx, batch] of batches.entries()) {
    await CampaignInfo.bulkCreate(batch, options(idx + 1, batches.length));
  }
}

async function saveContributorData(records: RawReportRecord[], batchSize: number) {
  const fields: Array<keyof CampaignInfoContributor> = [
    'appsflyerDeviceId',
    'network1',
    'campaign1',
    'touchType1',
    'touchTime1',
    'network2',
    'campaign2',
    'touchType2',
    'touchTime2',
    'network3',
    'campaign3',
    'touchType3',
    'touchTime3',
  ];
  const options = getBulkCreateOptions(fields, 'saveContributorData');
  const mapped = records
    .filter(record => record['Contributor 1 Media Source'])
    .map(record =>
      pickBy(
        {
          appsflyerDeviceId: record['AppsFlyer ID'],
          network1: getNormalizedNetwork(record['Contributor 1 Media Source']),
          campaign1: record['Contributor 1 Campaign'],
          touchType1: record['Contributor 1 Touch Type'],
          touchTime1: record['Contributor 1 Touch Time'],
          network2: getNormalizedNetwork(record['Contributor 2 Media Source']),
          campaign2: record['Contributor 2 Campaign'],
          touchType2: record['Contributor 2 Touch Type'],
          touchTime2: record['Contributor 2 Touch Time'],
          network3: getNormalizedNetwork(record['Contributor 3 Media Source']),
          campaign3: record['Contributor 3 Campaign'],
          touchType3: record['Contributor 3 Touch Type'],
          touchTime3: record['Contributor 3 Touch Time'],
        },
        identity,
      ),
    );
  const batches = chunk(mapped, batchSize);
  for (const [idx, batch] of batches.entries()) {
    await CampaignInfoContributor.bulkCreate(batch, options(idx + 1, batches.length));
  }
}

export const AppsflyerPull: Cron = {
  name: DaveCron.AppsflyerPull,
  process: runAllTasks,
  schedule: '0 19 * * *',
};
