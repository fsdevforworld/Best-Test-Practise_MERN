import * as config from 'config';
import { IQueueInfo } from '@dave-inc/google-cloud-tasks-helpers';
import generateLoggingCreator from '../generate-logging-creator';

type CompleteBankConnectionRefreshData = {
  bankConnectionRefreshId: number;
};

const COMPLETE_BANK_CONNECTION_REFRESH_INFO: IQueueInfo = config.get(
  'googleCloud.tasks.handlers.completeBankConnectionRefresh',
);

const createCompleteBankConnectionRefresh = generateLoggingCreator<
  CompleteBankConnectionRefreshData
>(COMPLETE_BANK_CONNECTION_REFRESH_INFO);

export { CompleteBankConnectionRefreshData, createCompleteBankConnectionRefresh };
