import { moment } from '@dave-inc/time-lib';
import {
  BankingDataSource,
  DaveBankingPubSubAccount,
  DaveBankingPubSubTransaction,
  ForecastJsonResponse,
} from '@dave-inc/wire-typings';
import * as Bluebird from 'bluebird';
import * as _ from 'lodash';
import { get, isEmpty } from 'lodash';
import { BankOfDaveDataSerializer } from '../../../domain/banking-data-source/bank-of-dave/data-serializer';
import * as BankingDataSync from '../../../domain/banking-data-sync';
import { bankConnectionUpdateCompletedEvent } from '../../../domain/event';
import * as Forecast from '../../../domain/forecast';
import { createMarketingEventsForUser } from '../../../domain/notifications';
import { bankTransactionsDidUpdate } from '../../../helper/bank-account';
import { AppsFlyerEvents, logAppsflyerEvent } from '../../../lib/appsflyer';
import logger from '../../../lib/logger';
import { BankAccount, BankConnection, BankConnectionTransition } from '../../../models';
import { AnalyticsEvent, BalanceLogCaller } from '../../../typings';
import { BankConnectionUpdateType } from '../../../typings/enums';
import AdvanceApprovalClient from '../../../lib/advance-approval-client';

const isSettledPaycheck = (trx: DaveBankingPubSubTransaction) =>
  get(trx, ['source', 'meta', 'directDeposit']) &&
  trx.amount >= AdvanceApprovalClient.MINIMUM_PAYCHECK_AMOUNT &&
  !trx.pending;

const isSettledCreditTran = (trx: DaveBankingPubSubTransaction) => !trx.debit && !trx.pending;

async function createACHCreditMarketingEvents(
  bankAccount: BankAccount,
  bodTransactions: DaveBankingPubSubTransaction[],
) {
  const ddTransactions = bodTransactions.filter(isSettledPaycheck);

  const nonDDCredits = _.difference(bodTransactions.filter(isSettledCreditTran), ddTransactions);

  for (const ddTransaction of ddTransactions) {
    await createMarketingEventsForUser(
      bankAccount.userId.toString(),
      AnalyticsEvent.AchCreditDirectDepositSettled,
      {
        amount: ddTransaction.amount,
        description: ddTransaction.source.name || 'ACH Credit',
      },
    );

    await logAppsflyerEvent({
      userId: bankAccount.userId,
      eventName: AppsFlyerEvents.DAVE_CHECKING_DIRECT_DEPOSIT_RECEIVED,
    });
  }

  await Bluebird.each(nonDDCredits, async () => {
    await logAppsflyerEvent({
      userId: bankAccount.userId,
      eventName: AppsFlyerEvents.DAVE_CHECKING_DEPOSIT_RECEIVED,
    });
  });
}

export async function consumeBankTransactions(
  bodAccount: DaveBankingPubSubAccount,
  bodTransactions: DaveBankingPubSubTransaction[],
  publishedAt: string,
) {
  if (isEmpty(bodTransactions)) {
    return;
  }

  const bankAccount = await BankAccount.findOne({
    include: [
      {
        model: BankConnection,
        include: [
          {
            model: BankConnectionTransition,
          },
        ],
      },
    ],
    where: {
      externalId: bodAccount.uuid,
    },
    paranoid: false,
  });

  const previousForecasts: { [id: number]: ForecastJsonResponse } = {};
  if (bankAccount) {
    const startFromPayPeriod = await Forecast.shouldShowAvailableToSpend(bankAccount.userId);

    previousForecasts[bankAccount.id] = await Forecast.computeAccountForecast(bankAccount, {
      startFromPayPeriod,
    });
  }

  // We no longer want to create new bank connections for old BOD accounts and bank connection creation will be managed entirely in the new banking services side
  if (!bankAccount) {
    logger.warn(`No bank account or bank connection for BOD account with uuid: ${bodAccount.uuid}`);
    return;
  }

  await createACHCreditMarketingEvents(bankAccount, bodTransactions);

  const transactions = BankOfDaveDataSerializer.serializePubSubTransactions(
    bodAccount.uuid,
    bodTransactions,
  );

  // We don't sync based on start and end dates any longer. We now sync based on what's incoming
  await BankingDataSync.syncDaveBankingTransactions(bankAccount, transactions);

  // TODO: Look into how often this needs to happen, possibly caching the value, this causes Banking's internal getAccounts call to spam
  const bankAccounts = await BankingDataSync.upsertBankAccounts(bankAccount.bankConnection);

  const lastUpdated = bankAccount.bankConnection.lastPull;

  await Bluebird.map(bankAccounts, async account => {
    await BankingDataSync.backfillDailyBalances(
      account,
      BalanceLogCaller.BankOfDaveTransactionsPubsubConsumer,
      BankingDataSource.BankOfDave,
      lastUpdated,
    );
  });

  await bankAccount.bankConnection.update({ lastPull: moment() });

  // TODO: Remove this and implement a solution that doesn't take away
  // our ability to collect from RETURNED or CANCELED transactions that
  // put bank accounts back into the black.
  const shouldCollect = bodTransactions.some(bodTransaction => {
    // Fixes issue where users attach Dave Banking debit cards to Plaid
    // accounts, creating an infinite feedback loop of collect,
    // returned, account updated, and repeat.
    //
    // Visa cards come back as RETURNED, and Mastercard cards come back
    // as CANCELED, both for insufficient funds errors.
    return bodTransaction.returned === false && bodTransaction.cancelled === false;
  });

  await bankTransactionsDidUpdate(bankAccount.bankConnection, bankAccounts, publishedAt, {
    previousForecasts,
    caller: BalanceLogCaller.BankOfDaveTransactionsPubsubConsumer,
    shouldUpdateBalanceLogs: true,
    shouldCollect,
  });

  await bankConnectionUpdateCompletedEvent.publish({
    bankConnectionId: bankAccount.bankConnectionId,
    userId: bankAccount.bankConnection.userId,
    bankAccountIds: [bankAccount.id],
    updateType: BankConnectionUpdateType.DEFAULT_UPDATE,
    connection: {
      authToken: bankAccount.bankConnection.authToken,
      externalId: bankAccount.bankConnection.externalId,
      userId: bankAccount.bankConnection.userId,
      bankingDataSource: bankAccount.bankConnection.bankingDataSource,
      lastPull: lastUpdated.format(),
    },
    bankAccounts: [{ id: bankAccount.id.toString(), externalId: bankAccount.externalId }],
    options: {
      historical: false,
      source: BalanceLogCaller.BankOfDaveTransactionsPubsubConsumer,
      initialPull: false,
    },
  });
}
