import * as PromiseRouter from 'express-promise-router';
import { Router } from 'express';

import {
  queryBankTransactions,
  countTransactions,
  createBankTransactions,
  getReplicaLag,
} from './controller';

import { getBankAccount, getPrimaryBankAccounts } from './get-bank-account';
import { findResourceOr404 } from '../aether/middleware';
import { BankAccount } from '../../models';

export const bankingDataRouter: Router = PromiseRouter();

bankingDataRouter.post('/bank-transaction/query', queryBankTransactions);
bankingDataRouter.get('/bank-transaction/count', countTransactions);
bankingDataRouter.get('/bank-transaction/replica-lag', getReplicaLag);
bankingDataRouter.post('/bank-transaction', createBankTransactions);

bankingDataRouter.get(
  '/bank-account/:bankAccountId',
  findResourceOr404(
    id => BankAccount.findOne({ where: { id }, useMaster: true }),
    'params.bankAccountId',
  ),
  getBankAccount,
);
bankingDataRouter.get('/user/:userId/primary-bank-accounts', getPrimaryBankAccounts);
