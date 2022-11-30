import * as PromiseRouter from 'express-promise-router';
import { Router } from 'express';

import { getNextExpectedTransaction, getIncomes, getById } from './controller';

export const recurringTransactionRouter: Router = PromiseRouter();

recurringTransactionRouter.get('/user/:userId/bank-account/:bankAccountId/income', getIncomes);
recurringTransactionRouter.get(
  '/recurring-transaction/:recurringTransactionId/expected-transaction/next',
  getNextExpectedTransaction,
);
recurringTransactionRouter.get('/recurring-transaction/:recurringTransactionId', getById);
