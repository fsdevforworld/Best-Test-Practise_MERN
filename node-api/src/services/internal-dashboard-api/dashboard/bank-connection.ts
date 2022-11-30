import { deleteBankConnection } from '../../../services/loomis-api/domain/delete-bank-account';
import { ConflictError, InvalidParametersError, NotFoundError } from '../../../lib/error';
import * as Bluebird from 'bluebird';
import { Advance, BankAccount, BankConnection } from '../../../models';
import {
  IDashboardApiRequest,
  BankingDataSourceErrorType,
  BalanceLogCaller,
  BankingDataSyncSource,
} from '../../../typings';
import { Response } from 'express';
import { BankingDataSourceError } from '../../../domain/banking-data-source/error';
import * as BankingDataSync from '../../../domain/banking-data-sync';

async function setCredentialsValidity(
  req: IDashboardApiRequest<{ hasValidCredentials: boolean }>,
  res: Response,
): Promise<Response> {
  if (!req.params || !req.params.id || !req.body || req.body.hasValidCredentials === undefined) {
    return res.status(400).send({});
  }
  const bankConn = await BankConnection.findByPk(req.params.id);
  await bankConn.update({ hasValidCredentials: req.body.hasValidCredentials });

  return res.status(200).send(bankConn);
}

async function deleteById(req: IDashboardApiRequest, res: Response): Promise<Response> {
  const connectionId = req.params.id;

  if (!connectionId) {
    throw new InvalidParametersError('Missing required parameter: id');
  }

  const connection = await BankConnection.findByPk(connectionId);

  if (!connection) {
    throw new NotFoundError(`Cannot find connection with id: ${connectionId}`);
  }

  const accounts = await BankAccount.findAll({ where: { bankConnectionId: connectionId } });
  const accountIds = accounts.map(account => account.id);
  const advances = await Advance.findAll({ where: { userId: connection.userId } });

  if (
    advances.find(advance => advance.outstanding > 0 && accountIds.includes(advance.bankAccountId))
  ) {
    throw new ConflictError('Cannot delete an account with outstanding advances');
  }

  await deleteBankConnection(connection, { admin: req.internalUser.id });
  return res.send({ success: true });
}

async function refresh(req: IDashboardApiRequest, res: Response) {
  const connectionId = req.params.id;

  if (!connectionId) {
    throw new InvalidParametersError('Missing required parameter: id');
  }

  const connection = await BankConnection.findByPk(connectionId);

  try {
    await BankingDataSync.upsertBankAccounts(connection);

    await BankingDataSync.fetchAndSyncBankTransactions(connection, {
      source: BankingDataSyncSource.SupportDashboard,
      historical: true,
    });
  } catch (ex) {
    const disconnectedTypes = [
      BankingDataSourceErrorType.Disconnected,
      BankingDataSourceErrorType.UserInteractionRequired,
      BankingDataSourceErrorType.NoLongerSupported,
    ];

    if (ex instanceof BankingDataSourceError && disconnectedTypes.includes(ex.errorType)) {
      await BankingDataSync.handleDisconnect(connection, ex);
    }

    return res.send({ success: false, error: ex });
  }

  const bankAccounts = await connection.getBankAccounts();

  await Bluebird.map(bankAccounts, account =>
    BankingDataSync.backfillDailyBalances(account, BalanceLogCaller.BankConnectionRefresh),
  );

  return res.send({ success: true });
}

export default {
  setCredentialsValidity,
  deleteById,
  refresh,
};
