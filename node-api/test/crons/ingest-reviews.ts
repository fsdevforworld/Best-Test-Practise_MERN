import { clean, up } from '../test-helpers';
import { expect } from 'chai';
import * as sinon from 'sinon';
import 'mocha';
import { AppStoreReview } from '../../src/models';
import { getReviewsForPlatform, Platform } from '../../src/crons/ingest-reviews';
import { AppBotReview } from '../../src/typings/appbot';
import * as request from 'superagent';
import stubBankTransactionClient from '../test-helpers/stub-bank-transaction-client';

describe('Reviews Pull Task', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  beforeEach(async () => {
    stubBankTransactionClient(sandbox);
    await up();
  });

  afterEach(() => clean(sandbox));

  it('should create the review', async () => {
    const review: AppBotReview = {
      app_id: 1645754,
      app_store_id: 'com.dave',
      id: 1,
      author: 'Dave DaBear',
      rating: 1,
      body:
        'read every single typed word in the sample pictures!! It even says it there! readers be warned! they take your money, please dont be stupid and read the reviews from other people aswell! they sit on there throne of lies! 😤🤦🙅',
      subject: '',
      published_at: '2019-08-14',
      version: null,
      country: 'English',
      country_code: 'en',
      translated_subject: null,
      translated_body: null,
      reply_text: null,
      reply_date: null,
      topics: ['Camera & Photos', 'Dissatisfied users'],
      store_id:
        'gp:AOqpTOE0_iKIkFCBi6cJb5jRBFq5QzvGbTX6XHq-T1YCdi_2fXWAQXfOJxo9ylwip5QI3581KDuJXFIQZxOIaBc',
      device: null,
      device_friendly_name: null,
      os_version: null,
      os_version_friendly_name: null,
      sentiment: 'negative',
      detected_language: 'English',
      permalink_url: 'https://appbot.co/apps/1645754-dave-banking-for-humans/reviews/1288679610',
      reply_url:
        'https://app.appbot.co/apps/1645754-dave-banking-for-humans/reviews/1288679610/reply',
      internal_url:
        'https://app.appbot.co/apps/1645754-dave-banking-for-humans/reviews/1288679610/internal',
    };

    sandbox.stub(request, 'get').returns({
      query() {
        return {
          auth() {
            return {
              body: {
                results: [review],
                total_pages: 1,
              },
            };
          },
        };
      },
    });

    await getReviewsForPlatform(Platform.ios, '2019-08-01', '2019-08-01');
    const info = await AppStoreReview.findOne({ where: { id: 1 } });
    expect(info.author).to.equal('Dave DaBear');
  });
});
