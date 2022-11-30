import * as Queue from 'bull';
import { JobManager as IJobManager, JobProcessor } from '../typings';
import { dogstatsd } from './datadog-statsd';
import logger from './logger';
import QueueOptions from './queue';
import { memoize } from 'lodash';

export default class JobManager<T> implements IJobManager<T> {
  public queueName: string;
  public process: JobProcessor<T>;
  public concurrency: number;
  public getQueue = memoize(() => {
    const queue = new Queue(this.queueName, { ...QueueOptions, ...this.options });
    this.addMetricListeners(queue, this.queueName);
    return queue;
  });

  constructor(
    queueName: string,
    processFn: JobProcessor<T>,
    concurrency: number = 1,
    private options?: Queue.QueueOptions,
  ) {
    this.queueName = queueName;
    this.process = getProcessWithRetry(this, processFn, queueName);
    this.concurrency = concurrency;
  }

  get queue() {
    return this.getQueue();
  }

  public add(data: T, jobOptions?: Queue.JobOptions): Promise<Queue.Job<T>> {
    // Merge default with jobOptions. Allow caller to overwrite (spread after rather than before).
    const combinedJobOptions = { removeOnComplete: true, ...jobOptions };
    return this.getQueue().add(data, combinedJobOptions);
  }

  private addMetricListeners(queue: Queue.Queue, queueName: string) {
    queue.on('stalled', () => {
      dogstatsd.increment('jobs.active', -1, { queueName });
    });

    queue.on('waiting', () => {
      dogstatsd.increment('jobs.waiting', 1, { queueName });
    });

    queue.on('active', () => {
      dogstatsd.increment('jobs.waiting', -1, { queueName });
      dogstatsd.increment('jobs.active', 1, { queueName });
    });

    queue.on('completed', () => {
      dogstatsd.increment('jobs.active', -1, { queueName });
      dogstatsd.increment('jobs.completed', 1, { queueName });
    });

    queue.on('error', () => {
      dogstatsd.increment('jobs.active', -1, { queueName });
      dogstatsd.increment('jobs.errored', 1, { queueName });
    });

    queue.on('failed', () => {
      dogstatsd.increment('jobs.active', -1, { queueName });
      dogstatsd.increment('jobs.failed', 1, { queueName });
    });
  }
}

export function getProcessWithRetry<T>(
  jobManager: JobManager<T>,
  processFn: JobProcessor<T>,
  queueName: string,
) {
  return async (job: Queue.Job<T>) => {
    try {
      await processFn(job);
    } catch (ex) {
      dogstatsd.increment('bullqueue_process.process_error', {
        queue_name: queueName,
      });
      logger.error('bullqueue processing error', { ex, queueName });
    }
  };
}
