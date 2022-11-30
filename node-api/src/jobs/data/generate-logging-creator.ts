import {
  generateCreator,
  IQueueInfo,
  Task,
  IOptions as ICloudTaskOptions,
} from '@dave-inc/google-cloud-tasks-helpers';
import { dogstatsd } from '../../lib/datadog-statsd';

function generateLoggingCreator<TPayload>(
  queueInfo: IQueueInfo,
): (payload: TPayload, options?: ICloudTaskOptions) => Promise<Task> {
  return generateCreator<TPayload>(queueInfo, dogstatsd);
}

export default generateLoggingCreator;
