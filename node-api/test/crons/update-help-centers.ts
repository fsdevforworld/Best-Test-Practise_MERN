import { expect } from 'chai';
import * as config from 'config';

import { replayHttp } from '../test-helpers';
import redisClient from '../../src/lib/redis';
import { bankingClient, overdraftClient } from '../../src/lib/zendesk-guide';
import { updateHelpCenter, updateAdvanceHelpCenter } from '../../src/crons/update-help-centers';

const bankingHelpCenterRedisKey = config.get<string>('helpCenter.bankingRedisKey');
const overdraftHelpCenterRedisKey = config.get<string>('helpCenter.overdraftRedisKey');
const advanceHelpCenterRedisKey = config.get<string>('helpCenter.advanceRedisKey');

describe('UpdateHelpCenterTask', () => {
  before(() => {
    return redisClient.flushallAsync();
  });

  afterEach(() => {
    return redisClient.flushallAsync();
  });

  it(
    'it should return articles, sections, and topArticles for banking product',
    replayHttp(
      'v2/help/help-center-banking.json',

      async () => {
        await updateHelpCenter(
          bankingClient,
          bankingHelpCenterRedisKey,
          'help_center_banking_update_task',
        );

        const helpCenterString = (await redisClient.getAsync(bankingHelpCenterRedisKey)) || '{}';
        expect(helpCenterString).to.be.a('string');

        const resObj = JSON.parse(helpCenterString);

        expect(resObj.sections).to.be.an('array');
        expect(resObj.topArticles).to.be.an('array');
        expect(resObj.articles).to.be.an('array');

        expect(resObj.sections[0].title).to.exist;
        expect(resObj.topArticles[0].title).to.exist;
        expect(resObj.articles[0].title).to.exist;
      },
    ),
  );

  it(
    'it should return articles, sections, and topArticles for overdraft product',
    replayHttp(
      'v2/help/help-center-overdraft.json',

      async () => {
        await updateHelpCenter(
          overdraftClient,
          overdraftHelpCenterRedisKey,
          'help_center_overdraft_update_task',
        );

        const helpCenterString = (await redisClient.getAsync(overdraftHelpCenterRedisKey)) || '{}';
        expect(helpCenterString).to.be.a('string');

        const resObj = JSON.parse(helpCenterString);

        expect(resObj.sections).to.be.an('array');
        expect(resObj.topArticles).to.be.an('array');
        expect(resObj.articles).to.be.an('array');

        expect(resObj.sections[0].title).to.exist;
        expect(resObj.topArticles[0].title).to.exist;
        expect(resObj.articles[0].title).to.exist;
      },
    ),
  );

  it(
    'it should return articles, sections, and topArticles for advance product',
    replayHttp(
      'v2/help/help-center-advance.json',

      async () => {
        await updateAdvanceHelpCenter();

        const helpCenterString = (await redisClient.getAsync(advanceHelpCenterRedisKey)) || '{}';
        expect(helpCenterString).to.be.a('string');

        const resObj = JSON.parse(helpCenterString);

        expect(resObj.sections).to.be.an('array');
        expect(resObj.topArticles).to.be.an('array');
        expect(resObj.articles).to.be.an('array');

        expect(resObj.sections[0].title).to.exist;
        expect(resObj.topArticles[0].title).to.exist;
        expect(resObj.articles[0].title).to.exist;
      },
    ),
  );
});
