import * as config from 'config';
import ErrorHelper from '@dave-inc/error-helper';
import { merge } from 'lodash';
import redisClient from '../lib/redis';
import logger from '../lib/logger';
import { dogstatsd } from '../lib/datadog-statsd';
import ZendeskGuideClient from '../lib/zendesk-guide/client';
import { Cron, DaveCron } from './cron';
import { overdraftClient, bankingClient } from '../lib/zendesk-guide';

const bankingHelpCenterRedisKey = config.get<string>('helpCenter.bankingRedisKey');
const overdraftHelpCenterRedisKey = config.get<string>('helpCenter.overdraftRedisKey');
const advanceHelpCenterRedisKey = config.get<string>('helpCenter.advanceRedisKey');

function run() {
  return Promise.all([
    updateHelpCenter(bankingClient, bankingHelpCenterRedisKey, 'help_center_banking_update_task'),
    updateHelpCenter(
      overdraftClient,
      overdraftHelpCenterRedisKey,
      'help_center_overdraft_update_task',
    ),
    updateAdvanceHelpCenter(),
  ]);
}

export async function updateAdvanceHelpCenter() {
  try {
    const overdraftHelpCenterData = await overdraftClient.fetchHelpCenter({
      label_names: 'advance',
    });
    const bankingHelpCenterData = await bankingClient.fetchHelpCenter({ label_names: 'advance' });
    const helpCenterData = merge(overdraftHelpCenterData, bankingHelpCenterData);

    const dataString = JSON.stringify(helpCenterData);
    await redisClient.setAsync(advanceHelpCenterRedisKey, dataString);
  } catch (error) {
    const taskName = 'help_center_advance_update_task';
    const formattedError = ErrorHelper.logFormat(error);
    logger.error(`Failed update help center articles for ${taskName}`, formattedError);
    dogstatsd.increment(`${taskName}.fail`);
  }
}

export async function updateHelpCenter(
  client: ZendeskGuideClient,
  redisKey: string,
  datadogMetric: string,
) {
  try {
    const helpCenterData = await client.fetchHelpCenter();
    const dataString = JSON.stringify(helpCenterData);
    await redisClient.setAsync(redisKey, dataString);
  } catch (error) {
    const formattedError = ErrorHelper.logFormat(error);
    logger.error(`Failed update help center articles for ${datadogMetric}`, formattedError);
    dogstatsd.increment(`${datadogMetric}.fail`);
  }
}

export const UpdateHelpCenters: Cron = {
  name: DaveCron.UpdateHelpCenters,
  process: run,
  schedule: '0 * * * *',
};
