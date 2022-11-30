import { BankTransaction } from '@dave-inc/heath-client';
import serialize from '../serialize';
import IBankTransactionResource from './i-bank-transaction-resource';

const serializer: serialize<
  BankTransaction,
  IBankTransactionResource
> = async function serializeBankTransaction(bankTransaction) {
  return {
    id: `${bankTransaction.id}`,
    type: 'bank-transaction',
    attributes: {
      amount: bankTransaction.amount,
      created: bankTransaction.created,
      displayName: bankTransaction.displayName,
      pending: bankTransaction.pending,
      transactionDate: bankTransaction.transactionDate,
      updated: bankTransaction.updated,
    },
  };
};

export default serializer;
