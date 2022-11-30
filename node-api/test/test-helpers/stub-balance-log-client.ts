import { moment } from '@dave-inc/time-lib';
import balanceLogClient from '../../src/lib/heath-client';
import { BalanceLogInput, BalanceLogNormalized } from '@dave-inc/heath-client';
import { BankingDataSource } from '@dave-inc/wire-typings';
import { Moment } from 'moment';
import { BankAccount } from '../../src/models';

const BalanceLogStore: { [bankAccountId: number]: BalanceLogNormalized[] } = {};

export async function clearBalanceLogStore() {
  Object.keys(BalanceLogStore).map((key: string) => {
    delete BalanceLogStore[parseInt(key, 10)];
  });
}

export function upsertBalanceLogForStubs(update: BalanceLogNormalized) {
  const bankAccountBalanceLogs = BalanceLogStore[update.bankAccountId] || [];
  const others = bankAccountBalanceLogs.filter(bLog => bLog.date !== update.date);
  BalanceLogStore[update.bankAccountId] = others.concat([update]);
}

export function stubBalanceLogsAroundPaycheck(
  bankAccount: BankAccount,
  paycheckDate: Moment | string,
  amount: number,
) {
  const startDate = moment(paycheckDate).subtract(1, 'day');
  const endDate = moment(paycheckDate).add(4, 'days');
  stubBalanceLogBetweenDates(bankAccount, startDate, endDate, amount);
}

export function stubBalanceLogBetweenDates(
  bankAccount: BankAccount,
  startDate: Moment,
  endDate: Moment,
  amount: number,
) {
  for (const date of moment.range(startDate, endDate).by('day')) {
    upsertBalanceLogForStubs({
      date: date.format('YYYY-MM-DD'),
      processorAccountId: bankAccount.externalId,
      bankAccountId: bankAccount.id,
      processorName: BankingDataSource.Plaid,
      bankConnectionId: bankAccount.bankConnectionId,
      userId: bankAccount.userId,
      current: amount,
      available: amount,
    });
  }
}

/**
 * Mock balance log client behavior
 *
 * @param {sinon.SinonSandbox} sandbox
 * @returns {void}
 */
export default function stubBalanceLogClient(sandbox: sinon.SinonSandbox) {
  sandbox.stub(balanceLogClient, 'saveBalanceLogs').callsFake(async (row: BalanceLogInput) => {
    const byBankAccountId = BalanceLogStore[row.bankAccountId] || [];
    const normalized: BalanceLogNormalized = {
      bankConnectionId: row.bankConnectionId,
      bankAccountId: row.bankAccountId,
      userId: row.userId,
      current: row.current,
      available: row.available,
      processorAccountId: row.processorAccountId,
      processorName: row.processorName,
      date: moment(row.date).format('YYYY-MM-DD'),
    };
    byBankAccountId.push(normalized);
    BalanceLogStore[row.bankAccountId] = byBankAccountId;
  });
  sandbox.stub(balanceLogClient, 'getBalanceLogs').callsFake(async (bankAccountId, dateRange) => {
    const rows = BalanceLogStore[bankAccountId] || [];

    // @ts-ignore
    const logs: BalanceLogNormalized[] = [];
    rows.forEach(row => {
      const { date } = row;
      const dateMoment = moment(date);
      const { start, end } = dateRange || {};
      if (
        !(start && end) ||
        (dateMoment.isSameOrAfter(moment(start)) && dateMoment.isSameOrBefore(moment(end)))
      ) {
        logs.push(row);
      }
    });

    return logs.sort((r1, r2) => (r1.date > r2.date ? 1 : -1));
  });
}
