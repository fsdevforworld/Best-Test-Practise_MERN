import * as Bluebird from 'bluebird';
import { BalanceLogCaller } from '@dave-inc/heath-types';

import { Advance, AuditLog, BankAccount } from '../../../models';

import logger from '../../../lib/logger';

import * as BankingDataSync from '../../../domain/banking-data-sync';
import { BalanceCheckTrigger, BankAccountBalances } from '../../../typings';

export async function runBalanceRefreshWithLock(
  advanceId: number,
  bankAccount: BankAccount,
  {
    useCache = false,
    refreshBalanceTimeout = 240000,
    caller = BalanceLogCaller.AetherBalanceRefresh,
  } = {},
) {
  try {
    const result = await refreshBalance(advanceId, bankAccount, {
      refreshBalanceTimeout,
      caller,
      useCache,
    });

    return { completed: true, result };
  } catch (err) {
    logger.error('Error refreshing balance for Tivan', {
      advanceId,
      bankAccountId: bankAccount.id,
      error: err,
    });

    const { userId } = await Advance.findByPk(advanceId);

    await AuditLog.create({
      userId,
      type: 'TIVAN_BALANCE_REFRESH',
      extra: {
        advanceId,
        bankAccountId: bankAccount.id,
        errorMessage: err.message,
      },
    });

    throw err;
  }
}

async function refreshBalance(
  advanceId: number,
  bankAccount: BankAccount,
  {
    useCache = false,
    refreshBalanceTimeout = 240000,
    caller = BalanceLogCaller.AetherBalanceRefresh,
  } = {},
): Promise<BankAccountBalances> {
  const freshBalances = await Bluebird.resolve(
    BankingDataSync.refreshBalance(bankAccount, {
      reason: BalanceCheckTrigger.ADVANCE_COLLECTION,
      advanceId,
      caller,
      useCache,
    }),
  ).timeout(refreshBalanceTimeout, 'BankingDataSource balance check timed out');

  return freshBalances;
}
