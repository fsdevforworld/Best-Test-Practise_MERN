import { Moment } from '@dave-inc/time-lib';
import BankingDataClient from '../../src/lib/heath-client';
import { BankingDataSource } from '@dave-inc/wire-typings';
import { BalanceLogCaller } from '../../src/typings';

/**
 * Generates balance logs based on the provided params for testing purposes
 *
 * @param {number} userId
 * @param {number} bankAccountId
 * @param {number} bankConnectionId
 * @param {moment.Moment} startDate
 * @param {number[]} amounts
 * @returns {Promise<DailyBalanceLog[]>}
 */
export default function createBalanceLogs(
  userId: number,
  bankAccountId: number,
  bankConnectionId: number,
  startDate: Moment,
  amounts: number[],
) {
  return Promise.all(
    amounts.map((amount: any) => {
      const promise = BankingDataClient.saveBalanceLogs({
        userId,
        bankAccountId,
        bankConnectionId,
        current: amount,
        available: amount,
        processorAccountId: 'asdf',
        processorName: BankingDataSource.Plaid,
        caller: BalanceLogCaller.BankConnectionRefresh,
        date: startDate.format('YYYY-MM-DD'),
      });
      startDate = startDate.clone().add(1, 'day');
      return promise;
    }),
  );
}
