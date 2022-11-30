import * as Bluebird from 'bluebird';
import { CronRepeatOptions, JobInformation, Queue } from 'bull';

import { CronJobManager } from '../typings';

const DEFAULT_CONCURRENCY = 10;

/**
 * Automatically handles keeping queue in sync with cron schedules.
 */
export async function syncCronQueue(queue: Queue, managers: CronJobManager[]): Promise<void> {
  const jobsToAdd: CronJobManager[] = [];
  managers.forEach(manager => {
    const alreadyExists = jobsToAdd.find(cjm => cjm.name === manager.name);
    if (alreadyExists) {
      throw new Error(`cron job "${manager.name}" is already registered.`);
    }

    // `limit` property does not appear to be stored in redis, so I
    // can't confidently match it later.
    if (manager.options.repeat.limit !== undefined) {
      manager.options.repeat = { ...manager.options.repeat };
      delete manager.options.repeat.limit;
    }

    jobsToAdd.push(manager);
  });

  await queue.isReady();
  const existingJobs = await queue.getRepeatableJobs();

  await Bluebird.each(existingJobs, async existingJob => {
    const existingCronRepeatOptions = jobInformationToCronRepeatOptions(existingJob);
    const jobToAddIndex = jobsToAdd.findIndex(cj => cj.name === existingJob.name);
    if (jobToAddIndex !== -1) {
      const jobToAdd = jobsToAdd[jobToAddIndex];
      if (cronRepeatOptionsAreEqual(jobToAdd.options.repeat, existingCronRepeatOptions)) {
        // Job is unchanged.
        processCronJobManager(queue, jobToAdd);
        jobsToAdd.splice(jobToAddIndex, 1);
        return;
      }
    }
    await queue.removeRepeatable(existingJob.name, existingCronRepeatOptions);
  });

  // New or changed jobs.
  await Promise.all(
    jobsToAdd.map(jobToAdd => {
      processCronJobManager(queue, jobToAdd);
      return queue.add(jobToAdd.name, {}, jobToAdd.options);
    }),
  );
}

function processCronJobManager(queue: Queue, cronJobManager: CronJobManager): void {
  return queue.process(
    cronJobManager.name,
    cronJobManager.concurrency || DEFAULT_CONCURRENCY,
    cronJobManager.process,
  );
}

export function jobInformationToCronRepeatOptions(
  j: JobInformation,
  limit?: number,
): CronRepeatOptions {
  return {
    cron: j.cron,
    endDate: j.endDate,
    limit,
    tz: j.tz,
  };
}

function cronRepeatOptionsAreEqual(a: CronRepeatOptions, b: CronRepeatOptions): boolean {
  return JSON.stringify(a, Object.keys(a).sort()) === JSON.stringify(b, Object.keys(b).sort());
}
