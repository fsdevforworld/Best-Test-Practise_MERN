import { CronRepeatOptions, Job, JobOptions, Queue } from 'bull';

export type JobProcessor<T> = (job: Job<T>) => PromiseLike<any>;

export type JobManager<T = any> = {
  add: (data: T) => PromiseLike<Job<T>>;
  process: JobProcessor<T>;
  queue: Queue;
  concurrency?: number;
};

export type CronJobManager = {
  concurrency?: number;
  name: string; // Must be unique per cron queue.
  options: CronJobOptions;
  process: CronJobProcessor;
};

export type CronJobOptions = JobOptions & {
  // Makes `repeat` required instead of optional.
  repeat: CronRepeatOptions;
};

// Cron jobs don't take any parameters.
export type CronJobProcessor = () => PromiseLike<any>;
