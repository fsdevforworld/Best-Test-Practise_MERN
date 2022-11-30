import { Cache } from '../../lib/cache';
import * as config from 'config';

const DEFAULT_AUTO_UPDATE_TTL = 60 * 60 * 24 * 7; // 1 week
const AUTO_UPDATE_TTL_CONFIG = 'recurringTransaction.autoDetectNewExpensesTTL';
const autoUpdateExpenseRateLimitCache = new Cache(
  'recurring_transaction.auto_update_expense_cache',
);

export async function setLimited(userId: number, bankConnectionId: number): Promise<void> {
  await autoUpdateExpenseRateLimitCache.set(
    getCacheKeyForUser(userId, bankConnectionId),
    'true',
    getAutoUpdateTTL(),
  );
}

export async function getLimited(userId: number, bankConnectionId: number): Promise<boolean> {
  const cacheValue = await autoUpdateExpenseRateLimitCache.get(
    getCacheKeyForUser(userId, bankConnectionId),
  );
  return Boolean(cacheValue);
}

function getCacheKeyForUser(userId: number, bankConnId: number): string {
  return `.userId:${userId}:bankConn:${bankConnId}`;
}

function getAutoUpdateTTL(): number {
  try {
    return Number(config.get<number | string>(AUTO_UPDATE_TTL_CONFIG));
  } catch {
    return DEFAULT_AUTO_UPDATE_TTL;
  }
}
