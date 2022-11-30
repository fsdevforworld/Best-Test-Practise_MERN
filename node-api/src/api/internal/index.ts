import { Router } from 'express';
import * as PromiseRouter from 'express-promise-router';
import { getAdvanceStatus } from './advance';
import { getBankAccount } from './bank-account/get-bank-account';
import { checkDuplicateUsers } from './check-duplicate-users';
import { create } from './dave-banking-connection';
import { getUser } from './user';

const router: Router = PromiseRouter();

router.post('/dave_banking_connection', create);
router.get('/user/:id', getUser);
router.get('/duplicate-users/:id', checkDuplicateUsers);
router.get('/user/:id/bank_account/:bankAccountId', getBankAccount);
router.get('/user/:id/advance/status', getAdvanceStatus);

export default router;
