import HeathClient from '../../src/lib/heath-client';
import { BankTransaction, QueryFilter, QueryOptions } from '@dave-inc/heath-client';
import * as sinon from 'sinon';
import { flatMap, forEach, isObject, orderBy } from 'lodash';
import { isMoment } from 'moment';
import { BankTransaction as DBBankTransaction } from '../../src/models';
import { Op } from 'sequelize';
import { moment } from '@dave-inc/time-lib';

const BankTransactionStore: { [bankAccountId: number]: BankTransaction[] } = {};

export async function clearBankTransactionStore() {
  Object.keys(BankTransactionStore).map((key: string) => {
    delete BankTransactionStore[parseInt(key, 10)];
  });
  await DBBankTransaction.destroy({ where: { id: { [Op.gt]: 0 } } });
}

export function deleteBankTransactionFromStore(bankAccountId: number, id: number) {
  const bankAccountBalanceLogs = BankTransactionStore[bankAccountId] || [];
  BankTransactionStore[bankAccountId] = bankAccountBalanceLogs.filter(bt => bt.id !== id);
}

export function upsertBankTransactionForStubs(update: BankTransaction) {
  update.transactionDate = moment(update.transactionDate).ymd();
  const bankAccountBalanceLogs = BankTransactionStore[update.bankAccountId] || [];
  const others = bankAccountBalanceLogs.filter(bt => bt.externalId !== update.externalId);
  BankTransactionStore[update.bankAccountId] = others.concat([update]);
}

export type BankingClientStub = Partial<
  {
    [P in keyof typeof HeathClient]: sinon.SinonStub;
  }
>;

/**
 * Mock bank transaction client behavior
 *
 * @param {sinon.SinonSandbox} sandbox
 * @returns {void}
 */
export default function stubBankTransactionClient(sandbox: sinon.SinonSandbox): BankingClientStub {
  sandbox.stub(HeathClient, 'createBankTransactions').callsFake(async (rows: BankTransaction[]) => {
    rows.forEach(row => {
      const existing = BankTransactionStore[row.bankAccountId];
      if (existing) {
        BankTransactionStore[row.bankAccountId] = existing
          .filter(b => b.externalId !== row.externalId)
          .concat([row]);
      } else {
        BankTransactionStore[row.bankAccountId] = [row];
      }
    });
  });
  sandbox.stub(HeathClient, 'countBankTransactions').callsFake(async (bankAccountId: number) => {
    return (BankTransactionStore[bankAccountId] || []).length;
  });
  const getBankTransactionsStub = sandbox
    .stub(HeathClient, 'getBankTransactions')
    .callsFake(getBankTransactions);
  const getSingleBankTransaction = sandbox
    .stub(HeathClient, 'getSingleBankTransaction')
    .callsFake(async (bankAccountId, filter, options = {}) => {
      options.limit = 1;
      const [bankTransaction] = await getBankTransactions(bankAccountId, filter, options);
      return bankTransaction;
    });
  sandbox.stub(HeathClient, 'getBankTransactionById').callsFake(async (id, bankAccountId) => {
    const [bankTransaction] = await getBankTransactions(bankAccountId, { id }, { limit: 1 });
    return bankTransaction;
  });
  sandbox
    .stub(HeathClient, 'getRecentBankTransactions')
    .callsFake(async (bankAccountId, minDate, options) => {
      return getBankTransactions(
        bankAccountId,
        {
          transactionDate: { gte: minDate },
        },
        options,
      );
    });
  sandbox
    .stub(HeathClient, 'getBatchedRecentBankTransactions')
    .callsFake(async (bankAccountId, minDate) => {
      return getBankTransactions(
        bankAccountId,
        {
          transactionDate: { gte: minDate },
        },
        {},
      );
    });
  sandbox
    .stub(HeathClient, 'getBankTransactionsByDisplayName')
    .callsFake(async (bankAccountId: number, displayName: string, limit: number = 4) => {
      return getBankTransactions(
        bankAccountId,
        {
          displayName,
        },
        { limit },
      );
    });

  return {
    getBankTransactions: getBankTransactionsStub,
    getSingleBankTransaction,
  };
}

async function getBankTransactions(
  bankAccountId: number | number[],
  filter: QueryFilter,
  options: QueryOptions,
) {
  let rows: BankTransaction[] = [];
  if (Array.isArray(bankAccountId)) {
    rows = flatMap(bankAccountId, bai => BankTransactionStore[bai] || []);
  } else {
    rows = BankTransactionStore[bankAccountId] || [];
  }

  rows = processFilter(rows, filter);
  if (options && options.order) {
    forEach(options.order, (order, field) => {
      rows = orderBy(
        rows,
        [field === 'status' ? 'pending' : field],
        [order.toLowerCase() as 'asc' | 'desc'],
      );
    });
  } else {
    rows = orderBy(rows, ['transactionDate'], ['desc']);
  }

  if (options && (options.limit || options.offset)) {
    const startIndex = options.offset || 0;
    const endIndex = startIndex + options.limit;

    rows = rows.slice(startIndex, endIndex);
  }

  return rows;
}

function processFilter(transactions: BankTransaction[], filter: QueryFilter): BankTransaction[] {
  forEach(filter, (value, key) => {
    if (key === 'or') {
      const orValues: BankTransaction[][] = (value as any[]).map((orFilter: QueryFilter) =>
        processFilter(transactions, orFilter),
      );
      transactions = orValues.reduce((prev, values) => {
        values.forEach(bt => {
          if (!prev.some(p => p.externalId === bt.externalId)) {
            prev = prev.concat(bt);
          }
        });

        return prev;
      }, []);
    } else if (key === 'status') {
      if (value.toString().toLowerCase() === 'pending') {
        transactions = processCompare(transactions, 'pending', true);
      } else {
        transactions = processCompare(transactions, 'pending', false);
      }
    } else {
      transactions = processCompare(transactions, key, value);
    }
  });

  return transactions;
}

function processCompare<T>(transactions: any[], field: string, compare: any) {
  return transactions.filter(bt => {
    if (Array.isArray(compare)) {
      return compare.includes(bt[field]);
    } else if (!isObject(compare)) {
      return bt[field] === compare;
    } else {
      let keep = true;
      forEach(compare, (value: any, operator: string) => {
        if (isMoment(value)) {
          value = value.ymd();
        }

        if (operator === 'gte') {
          keep = keep && bt[field] >= value;
        } else if (operator === 'gt') {
          keep = keep && bt[field] > value;
        } else if (operator === 'lt') {
          keep = keep && bt[field] < value;
        } else if (operator === 'lte') {
          keep = keep && bt[field] <= value;
        } else if (operator === 'like') {
          const likeCompare = (v: string) => {
            const searchString = v.replace(RegExp('%', 'g'), '.*');
            return RegExp(searchString, 'i').test(bt[field] as string);
          };
          if (Array.isArray(value)) {
            keep = keep && value.some(likeCompare);
          } else {
            keep = keep && likeCompare(value);
          }
        } else if (operator === 'notIn') {
          keep = keep && !value.includes(bt[field]);
        } else if (operator === 'in') {
          keep = keep && value.includes(bt[field]);
        }
      });
      return keep;
    }
  });
}
