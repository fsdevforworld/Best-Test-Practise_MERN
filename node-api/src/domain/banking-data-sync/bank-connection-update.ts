import { BankingDataSource } from '@dave-inc/wire-typings';
import * as Bluebird from 'bluebird';
import { dogstatsd } from '../../lib/datadog-statsd';
import logger from '../../lib/logger';
import redisClient from '../../lib/redis';
import { BankConnection } from '../../models';
import { BankConnectionUpdate } from '../../models/warehouse';
import { BankConnectionUpdateType, PLAID_WEBHOOK_CODE } from '../../typings';
import { bankConnectionUpdateEvent, bankConnectionInitialUpdateEvent } from '../event';

export async function saveAndPublishBankConnectionUpdate(
  connection: BankConnection,
  { code }: { code?: string; removed?: string[] } = {},
) {
  if (connection.bankingDataSource === BankingDataSource.Plaid) {
    saveAndPublishPlaidUpdate(connection, code);
  } else if (connection.bankingDataSource === BankingDataSource.Mx) {
    saveAndPublishMxUpdate(connection);
  } else {
    throw new Error(
      `Publishing bank connection updates is only supported for Plaid & Mx, not ${connection.bankingDataSource}`,
    );
  }
}

async function saveAndPublishPlaidUpdate(
  connection: BankConnection,
  code: string,
  removed?: string[],
): Promise<void> {
  const itemId = connection.externalId;
  switch (code) {
    case PLAID_WEBHOOK_CODE.INITIAL_UPDATE:
      await BankConnectionUpdate.create({
        userId: connection.userId,
        bankConnectionId: connection.id,
        type: BankConnectionUpdateType.INITIAL_UPDATE,
      });
      return bankConnectionInitialUpdateEvent.publish({
        itemId,
        code,
        userId: connection.userId,
        source: BankingDataSource.Plaid,
        updateType: BankConnectionUpdateType.INITIAL_UPDATE,
      });
    case PLAID_WEBHOOK_CODE.DEFAULT_UPDATE:
      await BankConnectionUpdate.create({
        userId: connection.userId,
        bankConnectionId: connection.id,
        type: BankConnectionUpdateType.DEFAULT_UPDATE,
      });
      return bankConnectionUpdateEvent.publish({
        itemId,
        code,
        source: BankingDataSource.Plaid,
        updateType: BankConnectionUpdateType.DEFAULT_UPDATE,
      });
    case PLAID_WEBHOOK_CODE.HISTORICAL_UPDATE:
      await BankConnectionUpdate.create({
        userId: connection.userId,
        bankConnectionId: connection.id,
        type: BankConnectionUpdateType.HISTORICAL_UPDATE,
      });
      return bankConnectionInitialUpdateEvent.publish({
        itemId,
        userId: connection.userId,
        code,
        historical: true,
        source: BankingDataSource.Plaid,
        updateType: BankConnectionUpdateType.HISTORICAL_UPDATE,
      });
    case PLAID_WEBHOOK_CODE.TRANSACTIONS_REMOVED:
      await BankConnectionUpdate.create({
        userId: connection.userId,
        bankConnectionId: connection.id,
        type: BankConnectionUpdateType.TRANSACTIONS_REMOVED,
        extra: { removed },
      });
      return bankConnectionUpdateEvent.publish({
        itemId,
        code,
        removed,
        source: BankingDataSource.Plaid,
        updateType: BankConnectionUpdateType.TRANSACTIONS_REMOVED,
      });
    default:
      logger.warn('Unsupported Plaid webhook code', { code });
  }
}

async function saveAndPublishMxUpdate(connection: BankConnection): Promise<void> {
  const isInitialUpdate = connection.initialPull === null;
  const updateType = isInitialUpdate
    ? BankConnectionUpdateType.INITIAL_UPDATE
    : BankConnectionUpdateType.DEFAULT_UPDATE;

  await BankConnectionUpdate.create({
    userId: connection.userId,
    bankConnectionId: connection.id,
    type: updateType,
  });
  return bankConnectionUpdateEvent.publish({
    itemId: connection.externalId,
    historical: isInitialUpdate, // The initial update is also the historical update for MX
    initial: isInitialUpdate,
    source: BankingDataSource.Mx,
    updateType,
  });
}

export function getBankConnectionUpdateRedisKey(itemId: string) {
  return `bank-connection-update-${itemId}`;
}

export async function saveMissingBankConnectionUpdate(
  code: string,
  itemId: string,
  removed: string[],
) {
  const data = { itemId, code, removed };
  const key = getBankConnectionUpdateRedisKey(itemId);
  await redisClient.lpushAsync(key, JSON.stringify(data));
  await redisClient.expireAsync(key, 3600);
}

export async function queueMissedBankConnectionUpdates(connection: BankConnection): Promise<void> {
  const key = getBankConnectionUpdateRedisKey(connection.externalId);
  const items = await redisClient.lrangeAsync(key, 0, -1);
  await Bluebird.map(items, (item: string) => {
    const { code, removed } = JSON.parse(item);
    dogstatsd.increment('bank_connection.queing_missed_webhook', 1, { code });
    return saveAndPublishBankConnectionUpdate(connection, { code, removed });
  });
}
