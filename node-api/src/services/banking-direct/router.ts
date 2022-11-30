import * as PromiseRouter from 'express-promise-router';
import { Router } from 'express';

import { ping, authenticate, getUser, getUserTransactions } from './controller';
import { requireSecret, requireDirectToken } from './middleware';

export const bankingDirectRouter: Router = PromiseRouter();

bankingDirectRouter.get('/', ping);
bankingDirectRouter.post('/users/auth_token', requireSecret, authenticate);
bankingDirectRouter.get('/users/:userId', requireSecret, requireDirectToken, getUser);
bankingDirectRouter.get(
  '/users/:userId/transactions',
  requireSecret,
  requireDirectToken,
  getUserTransactions,
);
