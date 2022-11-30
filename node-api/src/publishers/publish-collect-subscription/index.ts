import Task from './task';
import { moment } from '@dave-inc/time-lib';
import { runTaskGracefullyWithMetrics } from '../../lib/utils';

runTaskGracefullyWithMetrics(
  () => new Task(moment().format('YYYY-MM-DD')).run(),
  'publish_collect_subscription',
);
