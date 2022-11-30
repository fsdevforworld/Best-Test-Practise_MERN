import { ProcessBankConnectionRefreshData } from '../../data';
import logger from '../../../lib/logger';
import { BankConnection, BankConnectionRefresh } from '../../../models';
import { moment } from '@dave-inc/time-lib';
import * as Jobs from '../../data';
import setRefreshError from './set-refresh-error';
import * as BankingDataSync from '../../../domain/banking-data-sync';
import { PlaidIntegration } from '../../../domain/banking-data-source';
import { BankingDataSourceError } from '../../../domain/banking-data-source/error';
import { BankingDataSourceErrorType } from '../../../typings';

async function processBankConnectionRefresh({
  bankConnectionRefreshId,
}: ProcessBankConnectionRefreshData) {
  const bankConnectionRefresh = await BankConnectionRefresh.findByPk(bankConnectionRefreshId, {
    include: [BankConnection],
  });

  if (!bankConnectionRefresh) {
    logger.error('Bank connection refresh not found', { bankConnectionRefreshId });
    return;
  }

  if (bankConnectionRefresh.status !== 'RECEIVED') {
    logger.warn(
      'Bank connection refresh process step attempted for a refresh with status other than RECEIVED',
      { bankConnectionRefreshId, status: bankConnectionRefresh.status },
    );

    // Don't want to update to error in case the refresh is still being processed by another job
    return;
  }

  const { bankConnection } = bankConnectionRefresh;
  const client = new PlaidIntegration(bankConnection.authToken);

  let lastWebhookSentAt: string;
  let numTries = 0;

  while (true) {
    try {
      numTries++;

      const item = await client.getItem();

      lastWebhookSentAt = item?.status?.last_webhook?.sent_at;

      break;
    } catch (err) {
      if (!(err instanceof BankingDataSourceError)) {
        return;
      }

      if (!err.errorCode) {
        logger.warn('get item: unknown plaid response', { error: err.data });
      }

      try {
        // Handles disconnect. We want to absorb the error it will throw
        await BankingDataSync.handleBankingDataSourceError(err, bankConnection);
      } catch (err) {}

      // If error is not 500, it's our fault or there's a connection issue, so we do not want to retry
      if (err.errorType !== BankingDataSourceErrorType.InternalServerError || numTries >= 3) {
        return setRefreshError(
          bankConnectionRefresh,
          err.errorCode || 'PLAID_GET_ITEM_UNKNOWN_ERROR',
        );
      }
    }
  }

  if (!lastWebhookSentAt) {
    logger.warn('Last webhook not found while processing bank connection refresh', {
      bankConnectionRefreshId,
    });
    await bankConnectionRefresh.update({
      status: 'COMPLETED',
      completedAt: moment(),
    });
    return;
  }

  const lastWebhookSentAtMoment = moment(lastWebhookSentAt);

  // No new data so Plaid did not send a webhook
  if (lastWebhookSentAtMoment.isBefore(bankConnectionRefresh.requestedAt)) {
    await bankConnectionRefresh.update({
      status: 'COMPLETED',
      completedAt: moment(),
    });
    return;
  }

  await bankConnectionRefresh.update({
    status: 'PROCESSING',
    processingAt: moment(),
  });

  return Jobs.createCompleteBankConnectionRefresh({ bankConnectionRefreshId });
}

export default processBankConnectionRefresh;
