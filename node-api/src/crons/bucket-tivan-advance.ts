import * as Bluebird from 'bluebird';
import { moment } from '@dave-inc/time-lib';

import TivanCloudTaskExperiment, {
  TIVAN_AB_TESTING_EVENT,
} from '../experiments/tivan-cloud-task-experiment';
import TivanBankAccountUpdateExperiment, {
  TIVAN_BA_UPDATE_EVENT,
} from '../experiments/tivan-bank-account-update-experiment';
import { dogstatsd } from '../lib/datadog-statsd';
import { Advance, ABTestingEvent } from '../models';
import {
  AdvanceRowData,
  processPublishableAdvances,
} from '../publishers/publish-collect-advance/task';

import { Cron, DaveCron } from './cron';

async function process() {
  await processPublishableAdvances(
    (advanceRowData: AdvanceRowData[]) => {
      dogstatsd.increment('bucket_tivan_advance.num_batches');
      dogstatsd.increment('bucket_tivan_advance.num_advances', advanceRowData.length);
      return bucketAdvance(advanceRowData);
    },
    1000,
    {
      minDate: moment(),
      maxDate: moment(),
      minAdvanceAmount: 0,
    },
  );
}

async function bucketAdvance(advanceRowData: AdvanceRowData[]) {
  await Bluebird.map(
    advanceRowData,
    async ({ advanceId }: AdvanceRowData) => {
      const advance = await Advance.findByPk(advanceId);

      const cronJobExperiment = new TivanCloudTaskExperiment({ userId: advance.userId });

      if (cronJobExperiment.shouldUseCloudTask()) {
        const abTestingEventFields = {
          eventUuid: advance.id,
          eventName: TIVAN_AB_TESTING_EVENT,
          userId: advance.userId,
        };

        const isAlreadyBucketed = await ABTestingEvent.findOne({ where: abTestingEventFields });

        if (!isAlreadyBucketed) {
          await ABTestingEvent.create(abTestingEventFields);

          dogstatsd.increment('bucket_tivan_advance.advance_bucketed.daily_cronjob');
        }
      }

      const bankAccountUpdateExperiment = new TivanBankAccountUpdateExperiment({
        userId: advance.userId,
      });

      if (bankAccountUpdateExperiment.shouldUseCloudTask()) {
        const bankAccountabTestingEventFields = {
          eventUuid: advance.id,
          eventName: TIVAN_BA_UPDATE_EVENT,
          userId: advance.userId,
        };

        const isAlreadyBABucketed = await ABTestingEvent.findOne({
          where: bankAccountabTestingEventFields,
        });

        if (!isAlreadyBABucketed) {
          await ABTestingEvent.create(bankAccountabTestingEventFields);

          dogstatsd.increment('bucket_tivan_advance.advance_bucketed.bank_account_update');
        }
      }
    },
    { concurrency: 32 },
  );
}

export const BucketTivanAdvance: Cron = {
  name: DaveCron.BucketTivanAdvance,
  process,
  schedule: '0 4 * * *',
};
