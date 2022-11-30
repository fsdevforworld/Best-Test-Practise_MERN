import { bind } from 'lodash';
import { Router } from 'express';
import * as PromiseRouter from 'express-promise-router';

import { Advance, BankAccount, User } from '../../models';

import { getAdvance } from './get-advance';
import { getBankAccount, getBankAccountByUserAndExternalId } from './get-bank-account';
import { getUser } from './get-user';
import { refreshBalanceForBankAccount } from './refresh-balance';
import { findResourceOr404 } from './middleware';

const aetherRouter: Router = PromiseRouter();

aetherRouter.get(
  '/advance/:id',
  findResourceOr404(bind(Advance.findByPk, Advance), 'params.id'),
  getAdvance,
);
aetherRouter.get(
  '/bank-account/:id',
  findResourceOr404(bind(BankAccount.findByPk, BankAccount), 'params.id'),
  getBankAccount,
);
aetherRouter.get(
  '/bank-account/external/:externalId',
  findResourceOr404(bind(BankAccount.getAccountByExternalId, BankAccount), 'params.externalId'),
  getBankAccount,
);
aetherRouter.get(
  '/bank-account/external/user/:userId/:externalId',
  getBankAccountByUserAndExternalId,
);
aetherRouter.post(
  '/bank-account/:id/advance/:advanceId/refresh-balance',
  refreshBalanceForBankAccount,
);
aetherRouter.get('/user/:id', findResourceOr404(bind(User.findByPk, User), 'params.id'), getUser);

export default aetherRouter;
