import { Router } from 'express';
import * as PromiseRouter from 'express-promise-router';
import { registerUserAccount } from './controller';

const router: Router = PromiseRouter();
router.post('/register', registerUserAccount);

export default router;
