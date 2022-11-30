import * as config from 'config';
import { IQueueInfo } from '@dave-inc/google-cloud-tasks-helpers';
import generateLoggingCreator from '../generate-logging-creator';

type InitiateBankConnectionRefreshData = {
  bankConnectionRefreshId: number;
};

const INITIATE_BANK_CONNECTION_REFRESH_INFO: IQueueInfo = config.get(
  'googleCloud.tasks.handlers.initiateBankConnectionRefresh',
);

const createInitiateBankConnectionRefresh = generateLoggingCreator<
  InitiateBankConnectionRefreshData
>(INITIATE_BANK_CONNECTION_REFRESH_INFO);

export { createInitiateBankConnectionRefresh, InitiateBankConnectionRefreshData };
