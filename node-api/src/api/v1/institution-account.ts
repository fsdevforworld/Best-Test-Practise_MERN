import { Request, Response } from 'express';
import { PlaidError } from 'plaid';
import { deleteBankConnection } from '../../services/loomis-api/domain/delete-bank-account';
import { BankingDataSource } from '@dave-inc/wire-typings';
import SynapsepayNodeLib from '../../domain/synapsepay/node';
import * as BankingDataSync from '../../domain/banking-data-sync';
import { wrapMetrics } from '../../lib/datadog-statsd';
import { ConflictError, InvalidParametersError, NotFoundError } from '../../lib/error';
import logger from '../../lib/logger';
import { getFromCacheOrCreatePublicToken } from '../../lib/plaid';
import { Advance, BankAccount, BankConnection } from '../../models';
import { ConstraintMessageKey } from '../../translations';
import { IDaveRequest, PlaidItemWebhookCode } from '../../typings';
import { generateBankingDataSource } from '../../domain/banking-data-source';

export enum Metric {
  tokenNotFound = 'token.connection.notfound',
  notPlaid = 'token.connection.notPlaid',
  tokenError = 'token.error',
  itemError = 'bank_connection_update.plaid_webhook.item_error',
  webhookReceived = 'bank_connection_update.plaid_webhook',
}

export const metrics = wrapMetrics<Metric>();

async function getToken(req: IDaveRequest, res: Response): Promise<Response> {
  const connection = await BankConnection.findByPk(req.params.connectionId);
  if (!connection || connection.userId !== req.user.id) {
    metrics.increment(Metric.tokenNotFound);
    throw new NotFoundError();
  }

  if (connection.bankingDataSource !== BankingDataSource.Plaid) {
    metrics.increment(Metric.notPlaid);
    return res.json('');
  }

  let token;
  try {
    token = await getFromCacheOrCreatePublicToken(connection.authToken);
  } catch (error) {
    logger.error('Error getting Plaid token', { bankConnectionId: connection.id, error });
    const { error_code: errorCode } = error;
    metrics.increment(Metric.tokenError, { errorCode });
    return res.json('');
  }

  return res.json(token);
}

async function setCredentialsValid(req: IDaveRequest, res: Response): Promise<Response> {
  const connection = await BankConnection.findByPk(req.params.connectionId);
  if (!connection || connection.userId !== req.user.id) {
    throw new NotFoundError();
  }

  await BankingDataSync.setConnectionStatusAsValid(connection, {
    type: 'institution-endpoint',
  });

  return res.send({ success: true });
}

async function del(req: IDaveRequest, res: Response): Promise<Response> {
  const connectionId = req.params.connection;

  if (!connectionId) {
    throw new InvalidParametersError('Missing required parameter: connection');
  }

  const connection = await BankConnection.findByPk(connectionId);

  if (!connection || connection.userId !== req.user.id) {
    throw new NotFoundError(`Cannot find connection with id: ${connectionId}`);
  }

  const connections = await BankConnection.findAll({ where: { userId: req.user.id } });

  if (connections.length <= 1) {
    throw new InvalidParametersError(ConstraintMessageKey.OnlyBankConnection);
  }

  const accounts = await BankAccount.findAll({ where: { bankConnectionId: connectionId } });
  const accountIds = accounts.map(account => account.id);
  const advances = await Advance.findAll({ where: { userId: req.user.id } });

  if (
    advances.find(
      advance => advance.outstanding !== 0 && accountIds.includes(advance.bankAccountId),
    )
  ) {
    throw new ConflictError('Cannot delete an account while you have an active advance');
  }

  accounts.forEach(async account => {
    if (account.synapseNodeId) {
      await SynapsepayNodeLib.deleteSynapsePayNode(req.user, account);
      await account.update({ synapseNodeId: null });
    }
  });

  await deleteBankConnection(connection);
  return res.send({ success: true });
}

async function handleItemUpdate(code: PlaidItemWebhookCode, itemId: string, error: PlaidError) {
  const connection = await BankConnection.getOneByExternalId(itemId);

  if (!connection) {
    throw new NotFoundError(`Could not find bank_connection row with external_id: ${itemId}`);
  }

  if (code === 'ERROR') {
    metrics.increment(Metric.itemError, 1, {
      error_code: error.error_code,
    });
    const serializer = (await generateBankingDataSource(connection)).serializer;
    const serializedError = serializer.serializeError(error);
    await BankingDataSync.saveBankingDataSourceErrorCode(connection, serializedError);
  }
}

async function handleTransactionsUpdate(code: string, itemId: string, removed: string[]) {
  const connection = await BankConnection.getOneByExternalId(itemId);
  if (!connection) {
    await BankingDataSync.saveMissingBankConnectionUpdate(code, itemId, removed);
    throw new NotFoundError(`Could not find bank_connection row with external_id: ${itemId}`);
  }

  await BankingDataSync.saveAndPublishBankConnectionUpdate(connection, {
    code,
    removed,
  });
}

async function webhook(req: Request, res: Response): Promise<Response> {
  const {
    webhook_type: type,
    webhook_code: code,
    item_id: itemId,
    removed_transactions: removed,
    error,
  } = req.body;

  logger.info(JSON.stringify({ msg: 'Plaid webhook received', body: req.body }));
  metrics.increment(Metric.webhookReceived, 1, { type, code });
  switch (type) {
    case 'ITEM':
      await handleItemUpdate(code, itemId, error);
      break;
    case 'TRANSACTIONS':
      await handleTransactionsUpdate(code, itemId, removed);
      break;
    default:
      logger.warn('Unsupported webhook type', {
        type,
        code,
      });
  }

  return res.send({ success: true });
}

export default {
  getToken,
  del,
  webhook,
  setCredentialsValid,
};
