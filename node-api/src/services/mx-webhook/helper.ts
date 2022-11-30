import { BankingDataSource } from '@dave-inc/wire-typings';
import {
  IMxAggregationWebhookEventData,
  IMxConnectionStatusWebhookEventData,
  IMxWebhookEventData,
  MxAggregationWebhookEventAction,
  MxConnectionStatusWebhookEventAction,
  MxWebhookEventType,
} from '../../typings';

import { dogstatsd } from '../../lib/datadog-statsd';
import { InvalidParametersError } from '../../lib/error';

import { BankingDataSourceError } from '../../domain/banking-data-source/error';
import MxDataSerializer from '../../domain/banking-data-source/mx/data-serializer';
import { MX_CONNECTED_STATUSES } from '../../domain/banking-data-source/mx/integration';

import * as BankingDataSync from '../../domain/banking-data-sync';

import { BankConnection } from '../../models';
import logger from '../../lib/logger';

/**
 * Handles all MX web-hook events, currently supporting aggregation and connection status updates
 * Any uncaught errors will be logged and bubbled up as a 500 so that MX can retry
 * More details found here: https://atrium.mx.com/docs#webhooks
 *
 * @param {IMxWebhookEventData} event
 * @returns {Promise<void>}
 */
export async function handleWebhookEvent(event: IMxWebhookEventData): Promise<void> {
  dogstatsd.increment('bank_connection_update.mx_webhook.received', {
    type: event.type,
    action: event.action,
  });

  try {
    switch (event.type) {
      case MxWebhookEventType.Aggregation:
        return await handleAggregationEvent(event as IMxAggregationWebhookEventData);
      case MxWebhookEventType.ConnectionStatus:
        return await handleConnectionStatusEvent(event as IMxConnectionStatusWebhookEventData);
      default:
        logger.info(`Unhandled web-hook event type: ${event.type}`);
        return;
    }
  } catch (err) {
    dogstatsd.increment('bank_connection_update.mx_webhook.error', {
      error_class: err.constructor.name,
    });
    logger.error('Unexpected error while handling MX web-hook', {
      error: err,
    });

    throw err;
  }
}

/**
 * Handles Mx's aggregation webhook event
 * Each aggregation event has a corresponding action, and currently we only care about 'member_data_updated'
 *
 * @param {IMxAggregationWebhookEventData} event
 * @returns {Promise<void>}
 */
async function handleAggregationEvent(event: IMxAggregationWebhookEventData): Promise<void> {
  switch (event.action) {
    case MxAggregationWebhookEventAction.MemberDataUpdated:
      return handleMemberDataUpdated(event);
    default:
      logger.info(`Unhandled aggregation event action: ${event.action}`);
      return;
  }
}

/**
 * Handle's Mx's connection status webhook event
 * Each aggregation event has a corresponding action, and currently we only care about 'CHANGED'
 *
 * @param {IMxConnectionStatusWebhookEventData} event
 * @returns {Promise<void>}
 */
async function handleConnectionStatusEvent(
  event: IMxConnectionStatusWebhookEventData,
): Promise<void> {
  switch (event.action) {
    case MxConnectionStatusWebhookEventAction.Changed:
      return handleConnectionStatusChanged(event);
    default:
      logger.info(`Unhandled connection status event action: ${event.action}`);
      return;
  }
}

/**
 * Handles new Mx member information, publishing to our bank-connection-updater
 *
 * @param {IMxAggregationWebhookEventData} event
 * @returns {Promise<void>}
 */
async function handleMemberDataUpdated(event: IMxAggregationWebhookEventData): Promise<void> {
  const connection = await fetchMxConnectionByExternalId(event.member_guid);

  await BankingDataSync.saveAndPublishBankConnectionUpdate(connection);
}

/**
 * Handles changes to an Mx member's connection status, specifically re-connections & disconnections
 *
 * @param {IMxConnectionStatusWebhookEventData} event
 * @returns {Promise<void>}
 */
async function handleConnectionStatusChanged(
  event: IMxConnectionStatusWebhookEventData,
): Promise<void> {
  const connection = await fetchMxConnectionByExternalId(event.member_guid);

  if (MX_CONNECTED_STATUSES.includes(event.connection_status)) {
    await BankingDataSync.setConnectionStatusAsValid(connection, {
      type: 'mx-webhook',
    });
  } else {
    const bankingDataSourceErrorType = MxDataSerializer.mapDisconnectedStatusToErrorType(
      event.connection_status,
    );
    const error = new BankingDataSourceError(
      event.connection_status_message,
      BankingDataSource.Mx,
      event.connection_status,
      bankingDataSourceErrorType,
      { webhook: event },
    );

    // Handles not only saving this error type, but also logic related to bank disconnections
    // Including setting has_valid_credentials to false (if this error type qualifies)
    await BankingDataSync.saveBankingDataSourceErrorCode(connection, error);
  }
}

/**
 * Fetches Mx bank connection by external ID and ensures validity
 *
 * @param {string} externalId
 * @returns {Promise<BankConnection>}
 */
async function fetchMxConnectionByExternalId(externalId: string): Promise<BankConnection> {
  const connection = await BankConnection.getOneByExternalId(externalId);

  if (!connection) {
    throw new InvalidParametersError(
      `Could not find bank connection with external id: ${externalId}`,
    );
  }
  if (connection.bankingDataSource !== BankingDataSource.Mx) {
    throw new Error(
      `Bank connection with external id: ${externalId} is not MX. Found: ${connection.bankingDataSource}`,
    );
  }

  return connection;
}
