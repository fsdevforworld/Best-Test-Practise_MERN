import * as request from 'superagent';
import * as config from 'config';
import * as Bluebird from 'bluebird';
import { get } from 'lodash';

import { AppStoreReview } from '../models';
import { Platform } from '../models/app-store-review';
import { moment } from '@dave-inc/time-lib';
import { AppBotReview, AppBotReviewResultsPage } from '../typings/appbot';
import { Cron, DaveCron } from './cron';
import logger from '../lib/logger';

type Config = {
  appId: string;
  platform: Platform;
};

interface IConfig {
  [key: string]: Config;
}

export { Platform };

const configMap: IConfig = {
  [Platform.ios]: {
    platform: Platform.ios,
    appId: config.get('appbot.iOSAppId'),
  },
  [Platform.android]: {
    platform: Platform.android,
    appId: config.get('appbot.androidAppId'),
  },
};

export async function run() {
  const start: string = moment()
    .subtract(2, 'days')
    .format('YYYY-MM-DD');
  const end: string = moment()
    .subtract(1, 'days')
    .format('YYYY-MM-DD');
  const step = 2;
  return getReviewsForPlatform(Platform.android, start, end, step).then(() =>
    getReviewsForPlatform(Platform.ios, start, end, step),
  );
}

export async function getReviewsForPlatform(
  platform: Platform,
  from: string,
  to: string,
  step: number = 1,
) {
  const info: Config = configMap[platform];

  const format = 'YYYY-MM-DD';
  const timestamp = moment().toISOString();
  const dateRange = moment.range(moment(from), moment(to));
  const days: string[] = Array.from(dateRange.by('day', { step })).map(day => day.format(format));

  for (const start of days) {
    let end = moment(start)
      .add(step - 1, 'days')
      .format(format);
    if (moment(end) > moment(to)) {
      end = moment(to).format(format);
    }

    await getDailyReviews(start, end, info);
    logger.info(`${timestamp} - ${platform} - end data pull for ${start} - ${end}`);
  }
}

export async function getDailyReviews(start: string, end: string, info: Config, page: number = 1) {
  const { appId, platform } = info;
  const response: AppBotReviewResultsPage = await getReviews(start, end, appId, page);
  const reviews: AppBotReview[] = get(response, 'results', []);

  await AppStoreReview.bulkCreate(
    reviews.map(item => {
      const { id, published_at, subject, body, author, rating, ...extra } = item;
      return { id, publishedDate: published_at, subject, body, author, rating, extra, platform };
    }),
    {
      fields: ['id', 'publishedDate', 'subject', 'body', 'author', 'rating', 'extra', 'platform'],
      updateOnDuplicate: ['id'],
    },
  );

  const totalPages = response.total_pages;
  if (page < totalPages) {
    await Bluebird.delay(3000); // AppBot Rate limit of 20 request per minute
    await getDailyReviews(start, end, info, page + 1);
  }
}

/**
 * https://app.appbot.co/api
 * @param day - YYYY-MM-DD format
 * @param appId app id in review bot
 * @param page results page
 */
async function getReviews(
  start: string,
  end: string,
  appId: string,
  page: number,
): Promise<AppBotReviewResultsPage> {
  const username: string = config.get('appbot.username');
  const password: string = config.get('appbot.password');
  const response = await request
    .get(`https://api.appbot.co/api/v2/apps/${appId}/reviews`)
    .query({ start, end, page })
    .auth(username, password);
  return response.body;
}

export const IngestReviews: Cron = {
  name: DaveCron.IngestReviews,
  process: run,
  schedule: '5 2 * * *',
};
