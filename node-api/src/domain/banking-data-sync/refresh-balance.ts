import { BalanceLogCaller } from '@dave-inc/heath-types';
import {
  BalanceCheckTrigger,
  BankAccountBalances,
  BankAccountResponse,
  BankingDataSourceErrorType,
  PlaidErrorCode,
} from '../../typings';
import { BalanceCheck, BankAccount, BankConnection } from '../../models';
import { moment } from '@dave-inc/time-lib';
import * as Bluebird from 'bluebird';
import * as BankingDataSync from './index';
import { dogstatsd } from '../../lib/datadog-statsd';
import { BankDataSourceRefreshError, CUSTOM_ERROR_CODES } from '../../lib/error';
import HeathClient from '../../lib/heath-client';
import { BankingDataSourceError } from '../banking-data-source/error';
import { cacheBankAccountBalances, getBankAccountBalancesFromCache } from './balance-cache';
import { generateBankingDataSource } from '../banking-data-source';

export type RefreshBalanceParams = {
  reason?: BalanceCheckTrigger;
  timeout?: number;
  advanceId?: number;
  caller?: BalanceLogCaller;
  useCache?: boolean;
};

export async function refreshBalance(
  bankAccount: BankAccount,
  {
    reason = null,
    timeout = 240000,
    advanceId,
    caller,
    useCache = false,
  }: RefreshBalanceParams = {},
): Promise<BankAccountBalances> {
  if (useCache) {
    const cachedBalances = await getBankAccountBalancesFromCache(bankAccount);

    if (cachedBalances) {
      return cachedBalances as BankAccountBalances;
    }
  }

  const { externalId, bankConnectionId } = bankAccount;

  const bankConnection = await BankConnection.findOne({
    where: { id: bankConnectionId },
    paranoid: false,
  });

  const requestStart = moment();
  const bankingDataSource = await generateBankingDataSource(bankConnection);
  const accounts: any = await Bluebird.resolve(bankingDataSource.getBalance([externalId]))
    .timeout(timeout, `${bankConnection.bankingDataSource} balance refresh timed out`)
    .catch(async ex =>
      _handleBalanceRefreshFailure(ex, bankConnection, {
        trigger: reason,
        responseTime: moment().diff(requestStart, 'seconds'),
      }),
    );
  const requestEnd = moment();

  await BankingDataSync.setConnectionStatusAsValid(bankConnection, { type: 'balance-check' });

  const matchingAccount = accounts.find((a: BankAccountResponse) => a.externalId === externalId);

  if (!matchingAccount) {
    dogstatsd.increment('bank_account.refresh_balance.no_matching_external_id');
    throw new BankDataSourceRefreshError('Response does not contain bank account', {
      customCode: CUSTOM_ERROR_CODES.BANK_ACCOUNT_TRY_AGAIN,
      source: bankConnection.bankingDataSource,
    });
  }

  dogstatsd.increment('bank_account.refresh_balance.matching_external_id');
  const { available, current } = matchingAccount;

  await Bluebird.all([
    cacheBankAccountBalances([bankAccount]),
    HeathClient.saveBalanceLogs({
      bankConnectionId,
      bankAccountId: bankAccount.id,
      userId: bankAccount.userId,
      available,
      current,
      processorAccountId: bankAccount.externalId,
      processorName: bankConnection.bankingDataSource,
      date: requestStart.format(),
      caller,
    }),
    bankAccount.update({ available, current }),
    BalanceCheck.create({
      bankConnectionId,
      trigger: reason,
      responseTime: requestEnd.diff(requestStart, 'seconds'),
      successful: true,
      advanceId,
      extra: { balances: { available, current } },
    }),
  ]);

  return { available, current };
}

export async function handleBankingDataSourceError(
  err: BankingDataSourceError,
  bankConnection: BankConnection,
) {
  let customError;
  if (
    err.errorType === BankingDataSourceErrorType.Disconnected ||
    err.errorType === BankingDataSourceErrorType.UserInteractionRequired ||
    err.errorType === BankingDataSourceErrorType.NoLongerSupported ||
    err.errorCode === PlaidErrorCode.ItemLoginRequired
  ) {
    customError = new BankDataSourceRefreshError(err.message, {
      customCode: CUSTOM_ERROR_CODES.BANK_CONNECTION_DISCONNECTED,
      source: bankConnection.bankingDataSource,
    });
    await BankingDataSync.handleDisconnect(bankConnection, err);
  } else if (err.errorType === BankingDataSourceErrorType.RateLimitExceeded) {
    customError = new BankDataSourceRefreshError(err.message, {
      customCode: CUSTOM_ERROR_CODES.BANK_BALANCE_ACCESS_LIMIT,
      source: bankConnection.bankingDataSource,
    });
  } else if (err.errorCode === PlaidErrorCode.InternalServerError) {
    customError = new BankDataSourceRefreshError(err.message, {
      customCode: CUSTOM_ERROR_CODES.BANK_DATA_SOURCE_SERVER_ERROR,
      source: bankConnection.bankingDataSource,
    });
  } else {
    customError = new BankDataSourceRefreshError(err.message, {
      customCode: CUSTOM_ERROR_CODES.BANK_ACCOUNT_TRY_AGAIN,
      source: bankConnection.bankingDataSource,
    });
  }

  throw customError;
}

async function _handleBalanceRefreshFailure(
  err: BankingDataSourceError,
  bankConnection: BankConnection,
  balanceCheckLogData: Partial<BalanceCheck>,
) {
  await BalanceCheck.create({
    ...balanceCheckLogData,
    bankConnectionId: bankConnection.id,
    successful: false,
    extra: { err },
  });

  await handleBankingDataSourceError(err, bankConnection);
}
