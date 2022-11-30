import { wrapMetrics } from '../../lib/datadog-statsd';

export const enum Metrics {
  TaskCreated = 'advance_collection.send_to_tivan.task_created',
  TaskError = 'advance_collection.send_to_tivan.error',
  TaskWaitComplete = 'advance_collection.tivan_task_wait.complete',
  TaskWaitTimeout = 'advance_collection.tivan_task_wait.timeout',
}

export const metrics = wrapMetrics<Metrics>();
