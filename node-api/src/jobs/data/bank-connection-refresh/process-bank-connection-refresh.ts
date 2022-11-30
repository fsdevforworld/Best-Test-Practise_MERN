import * as config from 'config';
import { IQueueInfo } from '@dave-inc/google-cloud-tasks-helpers';
import generateLoggingCreator from '../generate-logging-creator';

type ProcessBankConnectionRefreshData = {
  bankConnectionRefreshId: number;
};

const PROCESS_BANK_CONNECTION_REFRESH_INFO: IQueueInfo = config.get(
  'googleCloud.tasks.handlers.processBankConnectionRefresh',
);

const createProcessBankConnectionRefresh = generateLoggingCreator<ProcessBankConnectionRefreshData>(
  PROCESS_BANK_CONNECTION_REFRESH_INFO,
);

export { createProcessBankConnectionRefresh, ProcessBankConnectionRefreshData };
