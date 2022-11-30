import { InitiateBankConnectionRefreshData } from '../../data';
import logger from '../../../lib/logger';
import { BankConnection, BankConnectionRefresh } from '../../../models';
import { moment } from '@dave-inc/time-lib';
import * as Jobs from '../../data';
import setRefreshError from './set-refresh-error';
import { PlaidIntegration } from '../../../domain/banking-data-source';
import { BankingDataSourceError } from '../../../domain/banking-data-source/error';
import * as BankingDataSync from '../../../domain/banking-data-sync';

async function initiateBankConnectionRefresh({
  bankConnectionRefreshId,
}: InitiateBankConnectionRefreshData) {
  const bankConnectionRefresh = await BankConnectionRefresh.findByPk(bankConnectionRefreshId, {
    include: [BankConnection],
  });

  if (!bankConnectionRefresh) {
    logger.error('Bank connection refresh not found', { bankConnectionRefreshId });
    return;
  }

  if (bankConnectionRefresh.status !== 'CREATED') {
    logger.warn(
      'Bank connection refresh initiation step attempted for a refresh with status other than CREATED',
      { bankConnectionRefreshId, status: bankConnectionRefresh.status },
    );

    // Don't want to update to error in case the refresh is still being processed by another job
    return;
  }

  const { bankConnection } = bankConnectionRefresh;
  const client = new PlaidIntegration(bankConnection.authToken);

  if (bankConnection.bankingDataSource !== 'PLAID') {
    logger.warn('Attempted dashboard refresh on non-plaid bank connection', {
      bankConnectionRefreshId,
    });
    await setRefreshError(bankConnectionRefresh, 'NON_PLAID_DATA_SOURCE');
    return;
  }

  await bankConnectionRefresh.update({ status: 'REQUESTED', requestedAt: moment() });

  try {
    await client.refreshTransactions();
  } catch (err) {
    if (!(err instanceof BankingDataSourceError)) {
      return;
    }

    if (!err.errorCode) {
      logger.warn('refresh transactions: unknown plaid response', { error: err });
    }

    try {
      // Handles disconnect. We want to absorb the error it will throw
      await BankingDataSync.handleBankingDataSourceError(err, bankConnection);
    } catch (err) {}

    return setRefreshError(
      bankConnectionRefresh,
      err.errorCode || 'PLAID_REFRESH_TRANSACTIONS_UNKNOWN_ERROR',
    );
  }

  await bankConnectionRefresh.update({ status: 'RECEIVED', receivedAt: moment() });

  return Jobs.createProcessBankConnectionRefresh({ bankConnectionRefreshId });
}

export default initiateBankConnectionRefresh;
