import * as Bluebird from 'bluebird';
import { moment } from '@dave-inc/time-lib';

import TivanCloudTaskExperiment, {
  TIVAN_AB_TESTING_EVENT,
} from '../../src/experiments/tivan-cloud-task-experiment';
import TivanBankAccountUpdateExperiment, {
  TIVAN_BA_UPDATE_EVENT,
} from '../../src/experiments/tivan-bank-account-update-experiment';
import { Advance, ABTestingEvent } from '../../src/models';
import logger from '../../src/lib/logger';
import {
  AdvanceRowData,
  processPublishableAdvances,
} from '../../src/publishers/publish-collect-advance/task';

const {
  TIVAN_BATCH_SIZE = '500',
  MIN_DATE = '2030-12-01',
  MAX_DATE = '2030-12-02',
  MIN_ADVANCE_AMOUNT = '0',
  TIVAN_CLOUD_TASK_ROLLOUT = '0',
  TIVAN_BANK_ACCOUNT_UPDATE_ROLLOUT = '0',
} = process.env;

let numberOfBatchesProcessed = 0;
let numberAdvances = 0;
let numberBucketedTivan = 0;
let numberBABucketedTivan = 0;

async function main() {
  logger.info('Running Tivan bucketing', {
    env: {
      TIVAN_BATCH_SIZE,
      MIN_DATE,
      MAX_DATE,
      MIN_ADVANCE_AMOUNT,
      TIVAN_CLOUD_TASK_ROLLOUT,
      TIVAN_BANK_ACCOUNT_UPDATE_ROLLOUT,
    },
  });

  await processPublishableAdvances(bucketAdvance, parseInt(TIVAN_BATCH_SIZE, 10), {
    minDate: moment(MIN_DATE),
    maxDate: moment(MAX_DATE),
    minAdvanceAmount: parseInt(MIN_ADVANCE_AMOUNT, 10),
  });
}

async function bucketAdvance(advanceRowData: AdvanceRowData[]) {
  logger.info(
    `Running bucket-tivan-advances with TIVAN_CLOUD_TASK_ROLLOUT of ${TIVAN_CLOUD_TASK_ROLLOUT}`,
  );

  const cloudTaskRolloutInt = parseInt(TIVAN_CLOUD_TASK_ROLLOUT, 10);

  logger.info(`Running bucket-tivan-advances with cloudTaskRolloutInt of ${cloudTaskRolloutInt}`);

  await Bluebird.map(
    advanceRowData,
    async ({ advanceId }: AdvanceRowData) => {
      numberAdvances++;

      const advance = await Advance.findByPk(advanceId);

      const cronJobExperiment = new TivanCloudTaskExperiment({ userId: advance.userId });

      let shouldUseCronTivan: boolean = false;

      if (cloudTaskRolloutInt > 7000) {
        shouldUseCronTivan = Math.random() * 10000 < cloudTaskRolloutInt;
      } else {
        shouldUseCronTivan = cronJobExperiment.shouldUseCloudTask();
      }

      if (shouldUseCronTivan) {
        const abTestingEventFields = {
          eventUuid: advance.id,
          eventName: TIVAN_AB_TESTING_EVENT,
          userId: advance.userId,
        };

        const isAlreadyBucketed = await ABTestingEvent.findOne({ where: abTestingEventFields });

        if (!isAlreadyBucketed) {
          await ABTestingEvent.create(abTestingEventFields);

          logger.info(`advanceId ${advance.id} bucketed into Tivan cronjob`);
          numberBucketedTivan++;
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

          logger.info(`advanceId ${advance.id} bucketed into Tivan bank account update`);
          numberBABucketedTivan++;
        }
      }
    },
    { concurrency: 32 },
  );

  numberOfBatchesProcessed++;
}

main()
  .then(() => {
    logger.info(`Processed ${numberOfBatchesProcessed} batches with ${TIVAN_BATCH_SIZE} per batch`);
    logger.info(`Bucketed ${numberBucketedTivan} to Tivan out of ${numberAdvances} total advances`);
    logger.info(
      `Bucketed ${numberBABucketedTivan} bank account updates to Tivan out of ${numberAdvances} total advances`,
    );
    process.exit(0);
  })
  .catch(error => {
    logger.error('Error unbucketing Tivan advances', { error });
    process.exit(1);
  });
