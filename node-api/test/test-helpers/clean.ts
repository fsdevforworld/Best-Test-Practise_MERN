import cleanDatabase from './clean-database';
import redisClient from '../../src/lib/redis';
import { clearBalanceLogStore } from './stub-balance-log-client';
import { clearBankTransactionStore } from './stub-bank-transaction-client';

export default function clean(sandbox?: sinon.SinonSandbox): PromiseLike<any> {
  return Promise.all([
    cleanDatabase(),
    clearBalanceLogStore(),
    redisClient.flushallAsync(),
    sandbox ? sandbox.restore() : undefined,
    clearBankTransactionStore(),
  ]);
}
