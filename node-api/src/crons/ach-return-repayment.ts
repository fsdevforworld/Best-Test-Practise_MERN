import * as csv from 'csv-parse';
import * as config from 'config';
import { moment, Moment, PACIFIC_TIMEZONE, Weekday } from '@dave-inc/time-lib';
import { isNil, memoize, once } from 'lodash';
import { getGCSFileStream } from '../lib/gcloud-storage';
import { AuditLog, Advance, BankAccount, AdminComment, User } from '../models';
import { getOutstanding, updateOutstanding } from '../domain/collection/outstanding';
import * as RT from '../domain/recurring-transaction';
import * as Repayment from '../domain/repayment';
import logger from '../lib/logger';
import { AdvanceCollectionTrigger, AnalyticsEvent, RecurringTransactionStatus } from '../typings';
import Braze from '../lib/braze';
import { wrapMetrics } from '../lib/datadog-statsd';
import { Cron, DaveCron } from './cron';
import { Readable } from 'stream';

/**
 * This cronjob is meant to be temporarily scheduled, while we try to
 * collect payments from users affectd by the December 2020 ACH return
 * issue
 */

enum Metrics {
  NumEvaluated = 'ach_return_repayment.num_evaluated',
  AdvancePaidOff = 'ach_return_repayment.advance.paid',
  AdvanceOutstanding = 'ach_return_repayment.advance.has_outstanding',
  TaskEnqueued = 'ach_return_repayment.task',
  AmountScheduled = 'ach_return_repayment.amount',
  NoPaycheck = 'ach_return_repayment.no_paycheck',
}

const metrics = wrapMetrics<Metrics>();

const IsDryRun = process.env.DRY_RUN?.toLowerCase() === 'true';

export async function getPaycheckOnDate(
  ymd: string,
  bankAccountId: number,
): Promise<RT.ExpectedTransaction | null> {
  const bankAccount = await BankAccount.findByPk(bankAccountId);
  if (!isNil(bankAccount?.mainPaycheckRecurringTransactionId)) {
    const income = await RT.getById(bankAccount.mainPaycheckRecurringTransactionId);
    if (!isNil(income) && income.status === RecurringTransactionStatus.VALID) {
      const next = await RT.getNextExpectedTransaction(income, moment(ymd).add(-1, 'day'));
      if (next?.expectedDate.ymd() === ymd) {
        return next;
      }
    }
  }
}

const getTaskStartTime: (ymd: string) => Moment = memoize((ymd: string) => {
  return moment(ymd)
    .tz(PACIFIC_TIMEZONE, true)
    .add(6, 'hours');
});

const getDaveUserId: () => number = once(() => {
  const daveUserId = config.get<number>('scripts.achReturnRepayment.internalUser');
  if (isNil(daveUserId) || isNaN(daveUserId)) {
    throw new Error('Invalid internal Dave user ID');
  }
  return daveUserId;
});

async function scheduleRepayment(
  ymd: string,
  advance: Advance,
  expectedTransactionId: number,
): Promise<void> {
  await Repayment.createAdvanceRepaymentTask(advance, AdvanceCollectionTrigger.PAYDAY_CATCHUP, {
    // start at 00:15 to allow enqueued midnight tasks to run first
    startTime: getTaskStartTime(ymd),
  });

  await Braze.track({
    events: [
      {
        name: AnalyticsEvent.AchReturnRepaymentScheduled,
        externalId: `${advance.userId}`,
        properties: {
          email: advance.user.email,
        },
        time: moment(),
      },
    ],
  });

  await AuditLog.create({
    message: `Scheduled ACH return repayment`,
    extra: {
      date: ymd,
      amount: advance.outstanding,
      expectedTransactionId,
    },
    userId: advance.userId,
    eventUuid: advance.id,
    type: 'SCHEDULE_ACH_RETURN_REPAYMENT',
    successful: true,
  });

  await AdminComment.create({
    userId: advance.userId,
    authorId: getDaveUserId(),
    message: `This user had an untracked ACH return. A repayment has been scheduled for ${ymd}`,
  });
}

export async function scheduleCollectionOnPayDay(ymd: string, advanceId: number): Promise<boolean> {
  metrics.increment(Metrics.NumEvaluated, { dryRun: `${IsDryRun}` });

  let advance = await Advance.findByPk(advanceId, {
    include: [User],
  });
  if (isNil(advance)) {
    return false;
  }

  const outstanding = (await getOutstanding(advance))?.toNumber();
  if (outstanding > 0) {
    metrics.increment(Metrics.AdvanceOutstanding, { dryRun: `${IsDryRun}` });

    const nextPaycheck = await getPaycheckOnDate(ymd, advance.bankAccountId);
    if (!isNil(nextPaycheck)) {
      logger.info(`scheduling collection for returned ACH advance ${advanceId} on ${ymd}`, {
        userId: advance.userId,
        amount: outstanding,
        dryRun: IsDryRun,
        expectedTransactionId: nextPaycheck.id,
      });
      metrics.increment(Metrics.TaskEnqueued, { dryRun: `${IsDryRun}` });
      metrics.increment(Metrics.AmountScheduled, outstanding, { dryRun: `${IsDryRun}` });

      if (!IsDryRun) {
        if (advance.outstanding !== outstanding) {
          advance = await updateOutstanding(advance);
        }
        await scheduleRepayment(ymd, advance, nextPaycheck.id);
      }
      return true;
    } else {
      metrics.increment(Metrics.NoPaycheck, { dryRun: `${IsDryRun}` });
      return false;
    }
  } else {
    metrics.increment(Metrics.AdvancePaidOff, { dryRun: `${IsDryRun}` });
    return false;
  }
}

function getNextWeekday(): Moment {
  const tomorrow = moment()
    .tz(PACIFIC_TIMEZONE)
    .add(1, 'day');
  if (tomorrow.day() >= 6) {
    return tomorrow.add(1, 'week').day(Weekday.Monday);
  } else {
    return tomorrow;
  }
}

export function attachAsyncDataListener<T>(
  stream: Readable,
  handler: (data: T) => Promise<void>,
): Readable {
  // GCS ReadStreams have multiple messages in flight and pause/resume on each message
  // don't work as expected. Enforce the pause/resume mechanism more explicitly by
  // monitoring concurrent messages being handled
  let concurrent = 0;

  stream.on('data', async data => {
    concurrent += 1;
    // trigger pause but aim low, a few more rows will come in before
    // the pause actually takes effect
    if (concurrent > 0 && !stream.isPaused()) {
      stream.pause();
    }
    await handler(data);

    concurrent -= 1;
    if (concurrent <= 0 && stream.isPaused()) {
      stream.resume();
    }
  });

  return stream;
}

async function run(): Promise<void> {
  const taskLimit = config.get<number>('scripts.achReturnRepayment.taskLimit');
  const gcsBucket = config.get<string>('scripts.achReturnRepayment.bucketName');
  const filePath = config.get<string>('scripts.achReturnRepayment.filePath');
  const ymd = getNextWeekday().ymd();

  logger.info('Starting ACH return repayment task', {
    internalUser: getDaveUserId(),
    gcsFile: `${gcsBucket}/${filePath}`,
    taskLimit,
    scheduleDate: ymd,
  });

  let runningTotal = 0;
  let tasksScheduled = 0;

  return new Promise(async (resolve, reject) => {
    const readStream = await getGCSFileStream(gcsBucket, filePath);

    const pipe = readStream.pipe(
      csv({
        skip_lines_with_error: true,
        columns: true,
      }),
    );

    attachAsyncDataListener(pipe, async (data: any) => {
      const { userId, advanceId } = data;
      runningTotal += 1;

      if (tasksScheduled < taskLimit) {
        logger.info(`Currently checking advance ${advanceId} for user ${userId}`);
        const scheduled = await scheduleCollectionOnPayDay(ymd, parseInt(advanceId, 10));

        if (scheduled) {
          tasksScheduled += 1;
        }

        if (tasksScheduled === taskLimit) {
          logger.info(`Task schedule limit reached ${taskLimit}`);
        }
      } else {
        logger.info(`Task limit reached, skipping advance ${advanceId} for user ${userId}`);
      }

      if (runningTotal % 1000 === 0) {
        logger.info(`Scheduled ${tasksScheduled} tasks, processed ${runningTotal} rows`);
      }
    })
      .on('error', reject)
      .on('end', () => {
        logger.info(`Processed ${runningTotal} advances, scheduled ${tasksScheduled} tasks`);
        resolve();
      });
  });
}

if (require.main === module) {
  run()
    .then(() => {
      logger.info('Finished updating advance outstanding amount');
      process.exit();
    })
    .catch(error => {
      logger.error('Error updating advance outstanding amount', error);
      process.exit(1);
    });
}

export const AchReturnRepayment: Cron = {
  name: DaveCron.AchReturnRepayment,
  process: run,
  // nightly at 4 AM PST, 5 AM PDT
  schedule: '0 12 * * *',
};
