import * as Bluebird from 'bluebird';

import { Cache } from '../../lib/cache';

import { BankAccount } from '../../models';
import { BankAccountBalances, BankAccountResponse } from '../../typings';

export const BALANCE_CHECK_CACHE_TTL = 60 * 60; // 1 hour

export const balanceCache = new Cache('banking_data_sync.balance_cache');

export function cacheBankAccountBalances(accounts: Array<BankAccount | BankAccountResponse>) {
  return Bluebird.map(accounts, async account => {
    const { available, current } = account;
    const cacheKey = getCacheKeyForBankAccount(account);

    await balanceCache.set(
      cacheKey,
      JSON.stringify({ available, current }),
      BALANCE_CHECK_CACHE_TTL,
    );
  });
}

export async function getBankAccountBalancesFromCache(
  account: BankAccount | BankAccountResponse,
): Promise<BankAccountBalances | null> {
  const cacheKey = getCacheKeyForBankAccount(account);

  const cachedBalances = await balanceCache.get(cacheKey);

  if (cachedBalances) {
    return JSON.parse(cachedBalances) as BankAccountBalances;
  }

  return null;
}

export function getCacheKeyForBankAccount(account: BankAccount | BankAccountResponse): string {
  return `.bank_account_id:${account.externalId}`;
}
