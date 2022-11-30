import { expect } from 'chai';
import * as sinon from 'sinon';
import * as config from 'config';

import { run } from '../../src/crons/update-chat-agent-count';
import zendeskChat from '../../src/lib/zendesk-chat';
import redisClient from '../../src/lib/redis';

describe('UpdateChatAgentCountTask', () => {
  const liveChatRedisKey = config.get<string>('liveChat.agentCountRedisKey');

  const sandbox = sinon.createSandbox();

  before(() => redisClient.flushallAsync());

  afterEach(() => Promise.all([redisClient.flushallAsync(), sandbox.restore()]));

  it('should saves agent count to redis ', async () => {
    sandbox.stub(zendeskChat, 'getAgentCount').resolves(10);
    await run();
    const agentCount = await redisClient.getAsync(liveChatRedisKey);
    expect(agentCount).to.be.equal('10');
  });
});
