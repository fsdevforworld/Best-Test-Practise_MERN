import '0-dd-trace-init-first-datadog-enabled';
import { isTestEnv, startDebugger } from '../../lib/utils';
import { deleteBankConnection } from '../../services/loomis-api/domain/delete-bank-account';
import { Message } from '@google-cloud/pubsub';
import { ConflictError, NotFoundError, UnsupportedBankConnection } from '../../lib/error';

import * as debugAgent from '@google-cloud/debug-agent';
import * as Bluebird from 'bluebird';

import { bankTransactionsDidUpdate } from '../../helper/bank-account';

import { BankAccount, BankConnection } from '../../models';
import { BankConnectionUpdate } from '../../models/warehouse';
import { dogstatsd } from '../../lib/datadog-statsd';
import { moment } from '@dave-inc/time-lib';
import * as config from 'config';
import {
  BalanceLogCaller,
  BankingDataSourceErrorType,
  EventSubscriber,
  IBankConnectionUpdatedEventData,
  PLAID_WEBHOOK_CODE,
  PlaidErrorCode,
  UnderwritingMLScoreEventTrigger,
  BankingDataSyncSource,
} from '../../typings';
import { BankingDataSourceError } from '../../domain/banking-data-source/error';
import { bankConnectionUpdateCompletedEvent, bankConnectionUpdateEvent } from '../../domain/event';
import * as Notification from '../../domain/notifications';
import * as MachineLearningDomain from '../../domain/machine-learning';
import { handleBankConnectionUpdaterError } from './bank-connection-updater-error-handler';
import * as Jobs from '../../jobs/data';
import { ForecastJsonResponse, MicroDeposit } from '@dave-inc/wire-typings';
import { lockAndRun, LockMode } from '../../lib/redis-lock';
import logger from '../../lib/logger';
import * as Forecast from '../../domain/forecast';
import * as BankingDataSync from '../../domain/banking-data-sync';
import * as RecurringTransaction from '../../domain/recurring-transaction';
import AdvanceApprovalClient from '../../lib/advance-approval-client';

const PLAID_UPDATER_MAX_MESSAGES = parseInt(config.get('plaid.maxUpdaterMessages'), 10);

startDebugger(debugAgent, 'plaid-updater');

function main(subscriptionName: string = EventSubscriber.BankConnectionUpdater) {
  bankConnectionUpdateEvent.subscribe({
    subscriptionName,
    onMessage: processEventWithLock,
    onError: error => logger.error('Pubsub error plaid updater', { error }),
    options: { flowControl: { maxMessages: PLAID_UPDATER_MAX_MESSAGES } },
  });
}

export async function processEventWithLock(event: Message, data: IBankConnectionUpdatedEventData) {
  const { itemId, removed = [], source } = data;
  try {
    dogstatsd.increment('bank_connection_updater.event_pulled', {
      source,
    });

    const { completed } = await lockAndRun(
      `bank-connection-updater-lock-${data.itemId}`,
      () => processEvent(event, data),
      { mode: LockMode.WAIT },
    );
    /*
     * In the case where we have a transactions deleted and a default update come in at the same time,
     * the delete transaction request should nack and retry until it runs because there is a possible case where
     * we are deleting a transaction that is outside of our normal sync window (7 days).
     */
    if (!completed && removed.length) {
      dogstatsd.increment('bank_connection_updater.lock_error', {
        type: 'detected',
        source,
      });
      event.nack();
    } else if (!completed) {
      dogstatsd.increment('bank_connection_updater.lock_error', {
        type: 'return',
        source,
      });
      event.ack();
    } else {
      dogstatsd.increment('bank_connection_updater.lock_success', { source });
    }
  } catch (err) {
    dogstatsd.increment('bank_connection_updater.lock_error', {
      type: 'error',
      source,
    });
    logger.error('Bank connection updater lock unknown error', { itemId, err });
    event.ack();
  }
}

async function getPreviousForecasts(
  bankConnection: BankConnection,
): Promise<{ [id: number]: ForecastJsonResponse }> {
  const startFromPayPeriod = await Forecast.shouldShowAvailableToSpend(bankConnection.userId);
  const accounts = await bankConnection.getBankAccounts();

  const previousForecasts: { [id: number]: ForecastJsonResponse } = {};
  await Bluebird.each(accounts, async acc => {
    if (acc.isSupported()) {
      previousForecasts[acc.id] = await Forecast.computeAccountForecast(acc, {
        startFromPayPeriod,
      });
    }
  });
  return previousForecasts;
}

async function processEvent(event: Message, data: IBankConnectionUpdatedEventData) {
  const { itemId, code, removed = [], source } = data;
  const startTime = moment();

  const isHistoricalPull = data.historical || code === PLAID_WEBHOOK_CODE.HISTORICAL_UPDATE;
  const isInitialPull = data.initial || code === PLAID_WEBHOOK_CODE.INITIAL_UPDATE;
  const isRemovalUpdate = code === PLAID_WEBHOOK_CODE.TRANSACTIONS_REMOVED;

  try {
    dogstatsd.increment('bank_connection_updater.event_processing', {
      source,
    });

    // get connection row before last_pull field is updated in
    const connection = await BankConnection.getOneByExternalId(itemId);
    if (!connection) {
      throw new NotFoundError(`Could not find bank connection with external id: ${itemId}`);
    }

    const user = await connection.getUser();
    const isUserPaused = await user.isPaused();

    const previousForecasts = isUserPaused ? {} : await getPreviousForecasts(connection);
    const lastUpdated = connection.lastPull;

    // If we are receiving a transaction webhook then the connection as a valid state
    await BankingDataSync.setConnectionStatusAsValid(connection, { type: 'plaid-updater' });

    const accounts = await updateAccountBalances(connection);
    if (isInitialPull) {
      await Promise.all(
        accounts.map(account => {
          return RecurringTransaction.setInitialIncomeDetectionRequired(account.id);
        }),
      );
    }
    await updateBankTransactions(connection, accounts, isHistoricalPull, isInitialPull, removed);

    await Bluebird.each(accounts, async account => {
      return BankingDataSync.backfillDailyBalances(
        account,
        BalanceLogCaller.PlaidUpdaterPubsubBackfill,
        connection.bankingDataSource,
        lastUpdated,
      );
    });

    await bankTransactionsDidUpdate(connection, accounts, event.publishTime.toISOString(), {
      shouldUpdateForecasts: !isUserPaused && code === PLAID_WEBHOOK_CODE.DEFAULT_UPDATE,
      shouldUpdateBalanceLogs: !isHistoricalPull,
      // We get a associated transactions update with a transaction removed so we only collect on the update
      shouldCollect: !isHistoricalPull && !isRemovalUpdate,
      previousForecasts,
      caller: BalanceLogCaller.PlaidUpdaterPubsub,
    });

    if (connection.primaryBankAccountId && !isRemovalUpdate) {
      MachineLearningDomain.triggerUnderwritingMlPreprocessJob({
        bankAccountId: connection.primaryBankAccountId,
        trigger: UnderwritingMLScoreEventTrigger.PlaidUpdater,
      }).catch(err => {
        logger.error('Error while scoring advance approval models on plaid update', {
          connectionId: connection.id,
          err,
        });
        dogstatsd.increment('plaid_updater.score_advance_approval_models_error');
      });
    }

    if (isHistoricalPull) {
      await sendHistoricalAlert(connection, accounts);
      await Jobs.createStitchOldAccountTransactionsTask({ bankConnectionId: connection.id });
    }

    await bankConnectionUpdateCompletedEvent.publish({
      bankConnectionId: connection.id,
      userId: connection.userId,
      bankAccountIds: accounts.map(acc => acc.id),
      updateType: data.updateType,
      connection: {
        authToken: connection.authToken,
        externalId: connection.externalId,
        mxUserId: user.mxUserId,
        userId: connection.userId,
        bankingDataSource: connection.bankingDataSource,
        lastPull: lastUpdated.format(),
      },
      bankAccounts: accounts.map(acc => ({ id: acc.id.toString(), externalId: acc.externalId })),
      options: {
        historical: isHistoricalPull,
        source: 'plaid-updater',
        initialPull: isInitialPull,
        removed,
      },
    });

    dogstatsd.increment('plaid_updater.process_event_success', {
      source,
    });
    event.ack();
  } catch (err) {
    dogstatsd.increment('plaid_updater.process_event_error', {
      source,
      error_code: err.errorCode,
      error_type: err.errorType,
      error_class: err.constructor.name,
    });

    handleBankConnectionUpdaterError(err, itemId, event);
  }

  const timeElapsedMs = moment().diff(startTime, 'ms');
  logger.info(`Finished Plaid Update Job`, {
    timeElapsedMs,
    itemId,
  });
  dogstatsd.increment(`plaid_updater.process_event.time_elapsed`, timeElapsedMs, {
    source,
  });
}

async function updateAccountBalances(connection: BankConnection): Promise<BankAccount[]> {
  try {
    const accounts = await BankingDataSync.upsertBankAccounts(connection);

    // try to fetch account and routing to override micro deposit on accounts that require it
    if (accounts.some(acc => acc.microDeposit === MicroDeposit.REQUIRED)) {
      dogstatsd.increment('plaid_updater.micro_deposit_required_auth_pull');
      await BankingDataSync.addAccountAndRoutingToAccounts(connection, accounts);
    }

    return accounts;
  } catch (err) {
    if (err instanceof ConflictError) {
      await _removeDuplicateConnection(connection, err.data);
      err = new BankingDataSourceError(
        err.message,
        connection.bankingDataSource,
        PlaidErrorCode.DuplicateAccountsFound,
        BankingDataSourceErrorType.NoOp,
        err,
        err.statusCode,
        null,
      );
    } else if (err instanceof UnsupportedBankConnection) {
      await _removeUnsupportedConnection(connection, err);
    } else {
      await BankingDataSync.handleDisconnect(connection, err);
    }
    throw err;
  }
}

/*
 * This connection has accounts that are already in our database. Delete it from plaid and the DB
 */
async function _removeDuplicateConnection(connection: BankConnection, data: any) {
  await Notification.sendMultipleAccounts(connection.userId);
  await BankConnectionUpdate.create({
    userId: connection.userId,
    bankConnectionId: connection.id,
    type: 'BANK_CONNECTION_DUPLICATE',
    extra: data,
  });
  await deleteBankConnection(connection);
}

async function _removeUnsupportedConnection(connection: BankConnection, error: any) {
  await deleteBankConnection(connection);
  await Notification.sendUnsupportedBankConnection(connection);
  return BankConnectionUpdate.create({
    userId: connection.userId,
    bankConnectionId: connection.id,
    type: 'BANK_CONNECTION_UNSUPPORTED',
    extra: { error },
  });
}

async function updateBankTransactions(
  connection: BankConnection,
  accounts: BankAccount[],
  historical: boolean,
  initialPull: boolean,
  removed: string[],
) {
  await BankingDataSync.fetchAndSyncBankTransactions(connection, {
    historical,
    source: BankingDataSyncSource.PlaidUpdater,
    initialPull,
    removed,
    accountIds: accounts.map(a => a.id),
  });

  connection.set({
    hasTransactions: true,
    lastPull: moment(),
  });

  if (historical) {
    connection.historicalPull = moment();
  }
  if (!connection.initialPull) {
    connection.initialPull = moment();
  }

  await connection.save();
}

async function sendHistoricalAlert(bankConnection: BankConnection, bankAccounts: BankAccount[]) {
  const user = await bankConnection.getUser();

  const account = bankAccounts.find(acc => acc.id === user.defaultBankAccountId);
  const isUserPaused = await user.isPaused();
  if (account && !isUserPaused) {
    const accountAge = await account.getAccountAgeFromTransactions();
    if (
      moment(bankConnection.created) < moment().subtract(3, 'minutes') &&
      accountAge >= AdvanceApprovalClient.MIN_ACCOUNT_AGE
    ) {
      await Notification.sendHistorical(bankConnection.id);
    }
  }
}

if (!isTestEnv()) {
  const susbcriptionName = process.env.BANK_CONNECTION_UPDATE_SUBSCRIPTION_NAME;
  main(susbcriptionName);
}
