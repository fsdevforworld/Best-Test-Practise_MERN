import { BankingDataSource } from '@dave-inc/wire-typings';
import * as config from 'config';

import BankConnectionSourceExperiment, {
  BankConnectionSourceExperimentBucket,
} from '../../experiments/bank-connection-source-experiment';

import { ABTestingEvent } from '../../models';

import { ABTestingEventName } from '../../typings';

import { metrics, ExperimentMetrics as Metrics } from './metrics';
import { minVersionCheck } from '../../lib/utils';

export const LIMIT_OF_USERS_TO_BUCKET_TO_MX =
  parseInt(config.get('mxAtrium.experiment.limit'), 10) || 0;

export const MINIMUM_APP_VERSION_TO_BUCKET_MX = '2.11.1';

/**
 * Determines if the given user is bucketed into the MX bank connection source experiment
 *
 * @param {number} userId
 * @param {BankConnectionSourceExperimentBucket} bucket
 * @returns {Promise<boolean>}
 */
export async function isUserBucketed(
  userId: number,
  bucket: BankConnectionSourceExperimentBucket,
): Promise<boolean> {
  return Boolean(
    await ABTestingEvent.findOne({
      where: {
        userId,
        eventName:
          bucket === BankingDataSource.Mx
            ? ABTestingEventName.BucketedIntoMxBankConnectionSourceExperiment
            : ABTestingEventName.BucketedIntoPlaidBankConnectionSourceExperiment,
      },
    }),
  );
}

/**
 * Buckets the given user into the bank connection source experiment
 * Traffic is distributed using the planout library, with 80% of users to plaid, 20% of users to MX
 * This will stop bucketing users into the MX bucket after 5,000 users have been bucketed to MX
 *
 * @param {number} userId
 * @param {string} appVersion
 * @param {string} deviceType
 * @returns {Promise<BankConnectionSourceExperimentBucket>}
 */
export async function bucketUser(
  userId: number,
  { appVersion, deviceType }: { appVersion?: string; deviceType?: string } = {},
): Promise<BankConnectionSourceExperimentBucket> {
  if (!minVersionCheck({ appVersion, deviceType }, MINIMUM_APP_VERSION_TO_BUCKET_MX)) {
    metrics.increment(Metrics.BANK_CONNECTION_SOURCE_USER_NOT_BUCKETED, {
      reason: 'user_does_not_have_minimum_app_version',
      version: MINIMUM_APP_VERSION_TO_BUCKET_MX,
    });

    return BankingDataSource.Plaid;
  }

  // Check if user is already bucketed
  const [bucketedIntoMx, bucketedIntoPlaid] = await Promise.all([
    isUserBucketed(userId, BankingDataSource.Mx),
    isUserBucketed(userId, BankingDataSource.Plaid),
  ]);
  if (bucketedIntoMx || bucketedIntoPlaid) {
    const existingBucket = bucketedIntoMx ? BankingDataSource.Mx : BankingDataSource.Plaid;

    metrics.increment(Metrics.BANK_CONNECTION_SOURCE_USER_NOT_BUCKETED, {
      reason: `user_already_bucketed_to_${existingBucket}`,
      limit: `${LIMIT_OF_USERS_TO_BUCKET_TO_MX}`,
    });

    return existingBucket;
  }

  // Check experiment user count limits
  const count = await ABTestingEvent.count({
    where: { eventName: ABTestingEventName.BucketedIntoMxBankConnectionSourceExperiment },
  });
  if (count >= LIMIT_OF_USERS_TO_BUCKET_TO_MX) {
    metrics.increment(Metrics.BANK_CONNECTION_SOURCE_USER_NOT_BUCKETED, {
      reason: 'limit_reached',
      limit: `${LIMIT_OF_USERS_TO_BUCKET_TO_MX}`,
    });

    return BankingDataSource.Plaid;
  }

  // Bucket user
  const bucket = new BankConnectionSourceExperiment({ userId }).getBucket();
  await ABTestingEvent.create({
    userId,
    eventName:
      bucket === BankingDataSource.Mx
        ? ABTestingEventName.BucketedIntoMxBankConnectionSourceExperiment
        : ABTestingEventName.BucketedIntoPlaidBankConnectionSourceExperiment,
  });
  metrics.increment(Metrics.BANK_CONNECTION_SOURCE_USER_BUCKETED, {
    bucket,
    limit: `${LIMIT_OF_USERS_TO_BUCKET_TO_MX}`,
  });

  return bucket;
}
