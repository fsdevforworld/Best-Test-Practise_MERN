import { BankTransaction } from '@dave-inc/heath-client';
import { bulkInsertAndRetry } from '../../src/lib/sequelize-helpers';
import { BankTransaction as DBBankTransaction } from '../../src/models';

export function createTransactions(transactions: BankTransaction[]) {
  return bulkInsertAndRetry(DBBankTransaction, transactions);
}
