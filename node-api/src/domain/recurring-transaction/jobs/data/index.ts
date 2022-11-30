import * as config from 'config';
import { isNil } from 'lodash';
import { generateCreator, IOptions, IQueueInfo, Task } from '@dave-inc/google-cloud-tasks-helpers';
import { moment } from '@dave-inc/time-lib';
import { getReadReplicaLag } from '../../../../helper/read-replica';
import { dogstatsd } from '../../../../lib/datadog-statsd';
import { UpdateExpectedTransactionData, UpdateExpectedTransactionsMaxLag } from '../handlers';

export const UPDATE_EXPECTED_TRANSACTIONS_INFO: IQueueInfo = config.get(
  'googleCloud.tasks.handlers.updateExpectedTransactions',
);

const _createUpdateExpectedTransactionsTask = generateCreator<UpdateExpectedTransactionData>(
  UPDATE_EXPECTED_TRANSACTIONS_INFO,
  dogstatsd,
);

export async function createUpdateExpectedTransactionsTask(
  data: UpdateExpectedTransactionData,
): Promise<Task> {
  let options: IOptions = {};
  const dbLag = await getReadReplicaLag();
  if (!isNil(dbLag) && dbLag < UpdateExpectedTransactionsMaxLag) {
    const taskLag = Math.min(dbLag + 60, 3600);
    options = {
      startTime: moment().add(taskLag, 'seconds'),
    };
  }
  return _createUpdateExpectedTransactionsTask(data, options);
}
