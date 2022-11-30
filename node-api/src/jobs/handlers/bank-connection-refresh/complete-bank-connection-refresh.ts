import { CompleteBankConnectionRefreshData } from '../../data';
import logger from '../../../lib/logger';
import { BankConnection, BankConnectionRefresh } from '../../../models';
import { moment } from '@dave-inc/time-lib';
import * as Jobs from '../../data';
import setRefreshError from './set-refresh-error';

async function completeBankConnectionRefresh({
  bankConnectionRefreshId,
}: CompleteBankConnectionRefreshData) {
  const bankConnectionRefresh = await BankConnectionRefresh.findByPk(bankConnectionRefreshId, {
    include: [BankConnection],
  });

  if (!bankConnectionRefresh) {
    logger.error('Bank connection refresh not found', { bankConnectionRefreshId });
    return;
  }

  const { bankConnection } = bankConnectionRefresh;

  if (bankConnectionRefresh.status !== 'PROCESSING') {
    logger.warn(
      'Bank connection refresh complete step attempted for a refresh with status other than PROCESSING',
      { bankConnectionRefreshId, status: bankConnectionRefresh.status },
    );

    if (bankConnectionRefresh.status !== 'COMPLETED') {
      await setRefreshError(bankConnectionRefresh, 'INVALID_STATUS_DURING_COMPLETE');
    }

    return;
  }

  // webhook has been processed
  if (bankConnectionRefresh.requestedAt.isSameOrBefore(bankConnection.lastPull)) {
    await bankConnectionRefresh.update({
      status: 'COMPLETED',
      completedAt: moment(),
    });

    return;
  }

  // We are taking too long to process the webhook
  if (bankConnectionRefresh.processingAt.isBefore(moment().subtract(3, 'minutes'))) {
    await setRefreshError(bankConnectionRefresh, 'WEBHOOK_PROCESSING_TIMEOUT');
    return;
  }

  // webhook has not been processed yet, enqueue this same job again in 20 seconds
  await Jobs.createCompleteBankConnectionRefresh(
    { bankConnectionRefreshId },
    { startTime: moment().add(10, 'seconds') },
  );
}

export default completeBankConnectionRefresh;
