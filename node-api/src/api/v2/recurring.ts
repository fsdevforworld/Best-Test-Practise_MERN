import { InvalidParametersError, NotFoundError } from '../../lib/error';
import { getParams } from '../../lib/utils';
import { isArray, isObject } from 'lodash';
import { BankAccount } from '../../models';
import { IDaveRequest, IDaveResponse } from '../../typings';
import { Response } from 'express';
import {
  StandardResponse,
  RecurringTransactionResponse,
  PossibleRecurringTransactionResponse,
} from '@dave-inc/wire-typings';
import {
  serializeRecurringTransactionResponse,
  serializeSingleRecurringTransactionResponse,
} from '../../serialization/serialize-recurring-transaction-response';
import * as RecurringTransactionDomain from '../../domain/recurring-transaction';
import { RecurringTransaction } from '../../domain/recurring-transaction';
import { LookbackPeriod } from '../../domain/recurring-transaction/types';
import { InvalidParametersMessageKey } from '../../translations';

type FilterFunction = (txn: RecurringTransaction) => boolean;

async function _getMatches(
  req: IDaveRequest,
  res: IDaveResponse<RecurringTransactionResponse[]>,
  filterFn: FilterFunction,
): Promise<Response> {
  const bankAccount = await BankAccount.findByPk(req.params.bankAccountId);
  if (!bankAccount || bankAccount.userId !== req.user.id) {
    throw new NotFoundError();
  }

  const recurring = await RecurringTransactionDomain.getByBankAccount(bankAccount.id);
  const jsonified: RecurringTransactionResponse[] = await serializeRecurringTransactionResponse(
    recurring.filter(filterFn),
    req.user,
    bankAccount,
  );

  return res.send(jsonified);
}

// Create a single recurring transaction
async function create(
  req: IDaveRequest,
  res: IDaveResponse<RecurringTransactionResponse>,
): Promise<Response> {
  const params = getParams(
    req.body,
    ['interval', 'params'],
    [
      'fromTransactionDisplayName',
      'userAmount',
      'userDisplayName',
      'skipValidityCheck',
      'bankTransactionId',
      'rollDirection',
    ],
  );

  const bankAccount = await BankAccount.findByPk(req.params.bankAccountId);
  if (!bankAccount || bankAccount.userId !== req.user.id) {
    throw new NotFoundError();
  }
  params.bankAccountId = bankAccount.id;
  params.userId = req.user.id;

  const recurringTransaction = await RecurringTransactionDomain.create(params);
  const [jsonified] = await serializeRecurringTransactionResponse(
    [recurringTransaction],
    req.user,
    bankAccount,
  );
  return res.send(jsonified);
}

// Create multiple recurring transactions at once
async function saveBulkExpenses(
  req: IDaveRequest,
  res: IDaveResponse<RecurringTransactionResponse[]>,
): Promise<Response> {
  const bankAccount = await BankAccount.findByPk(req.params.bankAccountId);
  if (!bankAccount || bankAccount.userId !== req.user.id) {
    throw new NotFoundError();
  }

  const transactions = req.body;

  // The provided transactions should be an array of objects
  if (!isArray(transactions) || transactions.some(element => !isObject(element))) {
    throw new InvalidParametersError(InvalidParametersMessageKey.TransactionsArray);
  }
  const allParams = transactions.map(t => {
    const p = getParams(
      t,
      ['interval', 'params', 'userAmount', 'userDisplayName'],
      ['skipValidityCheck', 'bankTransactionId', 'rollDirection'],
    );
    p.skipValidityCheck = true;
    return p;
  });

  const newExpenses = await RecurringTransactionDomain.saveBulkExpense(
    req.user.id,
    bankAccount.id,
    allParams,
  );

  const jsonified = await serializeRecurringTransactionResponse(newExpenses, req.user, bankAccount);

  return res.send(jsonified);
}

async function update(
  req: IDaveRequest,
  res: IDaveResponse<RecurringTransactionResponse>,
): Promise<Response> {
  const params = getParams(
    req.body,
    ['interval', 'params'],
    ['userAmount', 'userDisplayName', 'skipValidityCheck', 'rollDirection'],
  );

  const bankAccount = await BankAccount.findByPk(req.params.bankAccountId);
  if (!bankAccount || bankAccount.userId !== req.user.id) {
    throw new NotFoundError();
  }

  const trxn = await RecurringTransactionDomain.update(
    parseInt(req.params.transactionId, 10),
    params,
  );
  const [jsonified] = await serializeRecurringTransactionResponse([trxn], req.user, bankAccount);

  return res.send(jsonified);
}

async function del(req: IDaveRequest, res: IDaveResponse<StandardResponse>): Promise<Response> {
  const bankAccount = await BankAccount.findByPk(req.params.bankAccountId);
  if (!bankAccount || bankAccount.userId !== req.user.id) {
    throw new NotFoundError();
  }

  const recurringTransactionId = parseInt(req.params.transactionId, 10);
  await RecurringTransactionDomain.deleteById(recurringTransactionId);
  return res.send({ ok: true });
}

async function get(req: IDaveRequest, res: IDaveResponse<RecurringTransactionResponse>) {
  const { transactionId, bankAccountId } = req.params;
  const bankAccount = await BankAccount.findByPk(bankAccountId);
  if (!bankAccount || bankAccount.userId !== req.user.id) {
    throw new NotFoundError();
  }
  const recurring = await RecurringTransactionDomain.getById(transactionId);
  if (!recurring || recurring.userId !== req.user.id) {
    throw new NotFoundError();
  }

  const jsonified: RecurringTransactionResponse = await serializeSingleRecurringTransactionResponse(
    recurring,
    req.user,
    bankAccount,
    { lookbackPeriod: LookbackPeriod.EntireHistory },
  );

  return res.send(jsonified);
}

function getExpenses(
  req: IDaveRequest,
  res: IDaveResponse<RecurringTransactionResponse[]>,
): Promise<Response> {
  return _getMatches(req, res, txn => txn.userAmount < 0);
}

function getIncomes(
  req: IDaveRequest,
  res: IDaveResponse<RecurringTransactionResponse[]>,
): Promise<Response> {
  return _getMatches(req, res, txn => txn.userAmount > 0);
}

export async function detectPaychecks(
  req: IDaveRequest,
  res: IDaveResponse<PossibleRecurringTransactionResponse[]>,
): Promise<Response> {
  const { bankAccountId } = req.params;
  const bankAccount = await BankAccount.findByPk(bankAccountId);
  if (!bankAccount || bankAccount.userId !== req.user.id) {
    throw new NotFoundError();
  }

  const incomes = await RecurringTransactionDomain.detectIncome(bankAccount.id);
  return res.send(incomes);
}

export async function detectExpenses(
  req: IDaveRequest,
  res: IDaveResponse<PossibleRecurringTransactionResponse[]>,
): Promise<Response> {
  const { bankAccountId } = req.params;
  const bankAccount = await BankAccount.findByPk(bankAccountId);
  if (!bankAccount || bankAccount.userId !== req.user.id) {
    throw new NotFoundError();
  }

  const expenses = await RecurringTransactionDomain.detectExpenses(bankAccount.id);

  return res.send(expenses);
}

export default {
  getExpenses,
  getIncomes,
  create,
  saveBulkExpenses,
  update,
  detectExpenses,
  detectPaychecks,
  del,
  get,
};
