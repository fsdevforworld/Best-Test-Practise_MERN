import * as Bluebird from 'bluebird';
import { Op } from 'sequelize';
import AdvanceApprovalClient from '../lib/advance-approval-client';
import { MatchPaymentBankTransaction } from '../jobs';
import * as Jobs from '../jobs/data';
import gcloudKms from '../lib/gcloud-kms';
import { moment } from '@dave-inc/time-lib';
import { compareAccountRouting } from '../lib/utils';
import { BankAccount, BankConnection } from '../models';
import { BalanceLogCaller } from '../typings';
import * as Forecast from '../domain/forecast';
import * as NotificationDomain from '../domain/notifications';
import * as BankingDataSync from '../domain/banking-data-sync';
import {
  collectPastDueSubscriptionPayment,
  SUBSCRIPTION_COLLECTION_TRIGGER,
} from '../domain/collection';
import { ForecastJsonResponse } from '@dave-inc/wire-typings';

export default {
  findMatchingDeletedAccounts,
};

/*
 * Look for deleted bank accounts with matching account number
 * Only the encrypted account number exists for deleted bank accounts
 */
export async function findMatchingDeletedAccounts(toMatch: BankAccount): Promise<BankAccount[]> {
  const accountRouting = await gcloudKms.decrypt(toMatch.accountNumberAes256);

  const deletedBankAccounts = await BankAccount.findAll({
    where: {
      userId: toMatch.userId,
      deleted: { [Op.not]: null },
      accountNumberAes256: { [Op.not]: null },
    },
    paranoid: false,
  });

  const matchingBankAccounts = await Bluebird.filter(deletedBankAccounts, async ba => {
    const decrypted = await gcloudKms.decrypt(ba.accountNumberAes256);
    return compareAccountRouting(accountRouting, decrypted);
  });

  return matchingBankAccounts;
}

export async function findDeletedAccountOlderThanSixtyDays(
  toMatch: BankAccount,
): Promise<BankAccount> {
  const matchingBankAccounts = await findMatchingDeletedAccounts(toMatch);

  for (const bankAccount of matchingBankAccounts) {
    const accountAge = await bankAccount.getAccountAgeFromTransactions();
    if (accountAge >= AdvanceApprovalClient.MIN_ACCOUNT_AGE) {
      return bankAccount;
    }
  }
}

type BankTransactionsDidUpdateOptions = {
  shouldUpdateForecasts?: boolean;
  shouldUpdateBalanceLogs?: boolean;
  shouldCollect?: boolean;
  caller?: BalanceLogCaller;
  previousForecasts?: { [id: number]: ForecastJsonResponse };
};

/**
 * * Fired after bank sources push transactions to us and we've saved
 * them.
 *
 * @param bankConnection
 * @param bankAccounts
 * @param {string} publishedAt  The time that the event arrived that
 *                              triggered this update.
 * @param options
 */
export async function bankTransactionsDidUpdate(
  bankConnection: BankConnection,
  bankAccounts: BankAccount[],
  publishedAt: string,
  options: BankTransactionsDidUpdateOptions = {},
): Promise<void> {
  const {
    shouldUpdateForecasts = true,
    shouldUpdateBalanceLogs = true,
    shouldCollect = true,
    previousForecasts = {},
    caller,
  } = options;

  if (shouldUpdateBalanceLogs) {
    await BankingDataSync.updateBalanceLogs(bankConnection, bankAccounts, caller);
  }

  if (shouldCollect) {
    await triggerCollectionJobs(bankAccounts);
  }

  if (shouldUpdateForecasts) {
    await updateForecasts(bankAccounts, previousForecasts);
  }

  // We tried passing transaction ids into subsequent jobs at
  // one point but found that they were unreliable. Use connection ids
  // or account ids instead.
  const promises: Array<PromiseLike<any>> = [
    Jobs.createMatchDisbursementBankTransactionTask({ bankConnectionId: bankConnection.id }),
    MatchPaymentBankTransaction.add({ bankConnectionId: bankConnection.id }),
  ];

  if (shouldCollect) {
    promises.push(
      collectPastDueSubscriptionPayment({
        userId: bankConnection.userId,
        trigger: SUBSCRIPTION_COLLECTION_TRIGGER.BANK_ACCOUNT_UPDATE,
        wasBalanceRefreshed: true,
      }),
    );
  }

  await Promise.all(promises);
}

export async function triggerCollectionJobs(bankAccounts: BankAccount[]) {
  await Bluebird.map(bankAccounts, async bankAccount => {
    const collectData = { bankAccountId: bankAccount.id, updatedAt: moment().format() };

    await Jobs.createCollectAfterBankAccountUpdateTask(collectData);
  });
}

async function updateForecasts(
  allAccountsForSingleConnection: BankAccount[],
  previousForecasts: { [id: number]: ForecastJsonResponse },
) {
  const [{ userId }] = allAccountsForSingleConnection;

  const startFromPayPeriod = await Forecast.shouldShowAvailableToSpend(userId);

  await Bluebird.map(allAccountsForSingleConnection, async bankAccount => {
    // mark existing predictions before triggering new ones
    const forecast = await Forecast.computeAccountForecast(bankAccount, { startFromPayPeriod });
    await NotificationDomain.sendForecastAlerts(forecast, previousForecasts[bankAccount.id]);
  });
}

export async function getBankAccountById(bankAccountId: number): Promise<BankAccount> {
  return BankAccount.findByPk(bankAccountId);
}
