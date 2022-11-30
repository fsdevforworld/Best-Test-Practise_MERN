import * as config from 'config';
import zendeskChat from '../lib/zendesk-chat';
import redisClient from '../lib/redis';
import { dogstatsd } from '../lib/datadog-statsd';
import { Cron, DaveCron } from './cron';

const agentCountRedisKey = config.get<string>('liveChat.agentCountRedisKey');

export async function run() {
  dogstatsd.increment('update_chat_agent_count.task_started');
  try {
    const agentCount = await zendeskChat.getAgentCount();
    await redisClient.setAsync(agentCountRedisKey, agentCount);
  } catch (err) {
    dogstatsd.increment('update_chat_agent_count.redis_error');
  }
  dogstatsd.increment('update_chat_agent_count.task_completed');
}

export const UpdateChatAgentCount: Cron = {
  name: DaveCron.UpdateChatAgentCount,
  process: run,
  schedule: '*/5 * * * *',
  startingDeadlineSeconds: 120,
};
