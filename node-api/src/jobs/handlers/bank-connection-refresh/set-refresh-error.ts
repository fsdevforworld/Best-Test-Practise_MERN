import { BankConnectionRefresh } from 'src/models';
import { moment } from '@dave-inc/time-lib';

async function setRefreshError(bankConnectionRefresh: BankConnectionRefresh, code: string) {
  await bankConnectionRefresh.update({
    status: 'ERROR',
    errorAt: moment(),
    errorCode: code,
  });
}

export default setRefreshError;
