import { Request, Response } from 'express';
import * as RecurringTransactionDomain from '../../domain/recurring-transaction';
import { RecurringTransaction } from '../../domain/recurring-transaction';
import { TransactionType } from '../../typings';
import { RecurringTransactionNotFoundError } from './error';
import { moment } from '@dave-inc/time-lib';
import { serializeExpectedTransaction, serializeRecurringTransaction } from './serializer';

export async function getIncomes(req: Request, res: Response) {
  const userId = parseInt(req.params.userId, 10);
  const bankAccountId = parseInt(req.params.bankAccountId, 10);
  const { status } = req.query;

  let result: RecurringTransaction[];
  if (status) {
    result = await RecurringTransactionDomain.getUserIncomesByStatus(userId, bankAccountId, status);
  } else {
    result = await RecurringTransactionDomain.getByBankAccount(bankAccountId, {
      type: TransactionType.INCOME,
    });
  }

  res.json(result.map(serializeRecurringTransaction));
}

export async function getById(req: Request, res: Response) {
  const { recurringTransactionId } = req.params;

  const recurringTransaction = await RecurringTransactionDomain.getById(recurringTransactionId);

  if (!recurringTransaction) {
    throw new RecurringTransactionNotFoundError();
  }

  res.json(serializeRecurringTransaction(recurringTransaction));
}

export async function getNextExpectedTransaction(req: Request, res: Response) {
  const recurringTransactionId: number = parseInt(req.params.recurringTransactionId, 10);
  const after = moment(req.query.after);

  const recurringTransaction = await RecurringTransactionDomain.getById(recurringTransactionId);

  if (!recurringTransaction) {
    throw new RecurringTransactionNotFoundError();
  }

  const expected = await RecurringTransactionDomain.getNextExpectedTransaction(
    recurringTransaction,
    after,
  );

  res.json(serializeExpectedTransaction(expected));
}
