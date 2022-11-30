import AdvanceApprovalClient from '../../lib/advance-approval-client';
import { getCategory, isSupportedIncome } from '../../domain/bank-transaction';
import { NotFoundError } from '../../lib/error';
import { moment } from '@dave-inc/time-lib';
import { formatDisplayName } from '../../lib/format-transaction-name';

import { BankAccount } from '../../models';
import { IDaveRequest, IDaveResponse } from '../../typings';
import { CommonBankTransactionResponse } from '@dave-inc/wire-typings';
import { Response } from 'express';
import HeathClient from '../../lib/heath-client';
import { BankTransaction, SortOrder } from '@dave-inc/heath-client';

type FilterFunction = (txn: BankTransaction) => boolean;

async function _get(
  req: IDaveRequest,
  res: IDaveResponse<CommonBankTransactionResponse[]>,
  filterFn: FilterFunction,
) {
  const bankAccount = await BankAccount.findByPk(req.params.bankAccountId);
  if (!bankAccount || bankAccount.userId !== req.user.id) {
    throw new NotFoundError();
  }
  const {
    start = moment()
      .subtract(30, 'days')
      .format('YYYY-MM-DD'),
    end = moment().format('YYYY-MM-DD'),
  } = req.query;
  const transactions = await HeathClient.getBankTransactions(
    bankAccount.id,
    {
      transactionDate: { gte: start, lte: end },
    },
    {
      order: {
        status: SortOrder.DESC,
        updated: SortOrder.DESC,
      },
    },
  );
  const result = transactions.filter(filterFn).map(mapTransaction);
  return res.send(result);
}

function mapTransaction(txn: BankTransaction): CommonBankTransactionResponse {
  return {
    id: txn.id,
    amount: txn.amount,
    date: txn.transactionDate,
    displayName: formatDisplayName(txn.displayName),
    pending: txn.pending,
    category: getCategory(txn),
    isSupportedIncome: isSupportedIncome(txn.displayName, txn.amount),
    merchantInfo: txn.merchantInfo,
  };
}

function getRecent(
  req: IDaveRequest,
  res: IDaveResponse<CommonBankTransactionResponse[]>,
): Promise<Response> {
  return _get(req, res, () => true);
}

function getExpenses(
  req: IDaveRequest,
  res: IDaveResponse<CommonBankTransactionResponse[]>,
): Promise<Response> {
  return _get(req, res, txn => txn.amount < 0);
}

function getIncomes(
  req: IDaveRequest,
  res: IDaveResponse<CommonBankTransactionResponse[]>,
): Promise<Response> {
  return _get(req, res, txn => txn.amount > AdvanceApprovalClient.MINIMUM_PAYCHECK_AMOUNT);
}

async function getById(req: IDaveRequest, res: IDaveResponse<CommonBankTransactionResponse>) {
  const { transactionId, bankAccountId } = req.params;
  const bankAccount = await BankAccount.findByPk(bankAccountId);
  if (!bankAccount || bankAccount.userId !== req.user.id) {
    throw new NotFoundError();
  }
  const txn = await HeathClient.getBankTransactionById(
    Number(transactionId),
    Number(bankAccountId),
  );
  if (!txn) {
    throw new NotFoundError();
  }
  return res.send(mapTransaction(txn));
}

export default { getExpenses, getIncomes, getRecent, getById };
