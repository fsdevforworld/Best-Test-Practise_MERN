import * as Bluebird from 'bluebird';
import { MinimalRequest, getTaskName } from '@dave-inc/google-cloud-tasks-helpers';
import { metrics, RecurringTransactionMetrics } from '../../metrics';
import * as ExpectedHelper from '../../match-expected-transactions';
import BankConnection from '../../../../models/bank-connection';
import BankAccount from '../../../../models/bank-account';
import logger from '../../../../lib/logger';
import { TaskTooEarlyError, shouldTaskUseReadReplica } from '../../../../helper/read-replica';
import { BankingDataSyncSource } from '../../../../typings';

export type UpdateExpectedTransactionData = {
  bankConnectionId: number;
  source: BankingDataSyncSource;
  canUseReadReplica?: boolean;
};

export const UpdateExpectedTransactionsMaxLag = 12 * 60 * 60;

export async function updateExpectedTransactions(
  { bankConnectionId, source, canUseReadReplica = true }: UpdateExpectedTransactionData,
  req: MinimalRequest<UpdateExpectedTransactionData>,
): Promise<void> {
  try {
    metrics.increment(RecurringTransactionMetrics.UPDATE_JOB_TRIGGERED);

    const useReadReplica =
      canUseReadReplica && (await shouldTaskUseReadReplica(req, UpdateExpectedTransactionsMaxLag));
    await doUpdates({ bankConnectionId, source }, useReadReplica);

    metrics.increment(RecurringTransactionMetrics.UPDATE_JOB_SUCCESS, { source });
  } catch (err) {
    if (err instanceof TaskTooEarlyError) {
      const taskName = getTaskName(req);
      metrics.increment(RecurringTransactionMetrics.UPDATE_JOB_DEFERRED, { source });
      logger.warn('updateExpectedTransactions task deferred', {
        error: err,
        data: err.data as object,
        bankConnectionId,
        taskId: taskName,
        source,
      });
      throw err;
    } else {
      metrics.increment(RecurringTransactionMetrics.UPDATE_JOB_FAILURE, { source });
      logger.error('updateExpectedTransactions task failed', {
        error: err,
        bankConnectionId,
        source,
      });
    }
  }
}

async function doUpdates(
  { bankConnectionId, source }: UpdateExpectedTransactionData,
  useReadReplica: boolean = false,
) {
  const connection = await BankConnection.findByPk(bankConnectionId, { include: [BankAccount] });

  if (!connection) {
    metrics.increment(RecurringTransactionMetrics.UPDATE_JOB_CONNECTION_NOT_FOUND);
    return;
  }

  await Bluebird.each(connection.bankAccounts, async bankAccount => {
    await ExpectedHelper.updateByAccountId(bankAccount.id, source, useReadReplica);
  });
}
