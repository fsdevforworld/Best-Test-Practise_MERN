import * as PromiseRouter from 'express-promise-router';
import { Router } from 'express';

import { getBrazeAuthToken } from './controller';

const router: Router = PromiseRouter();
router.get('/braze-auth-token', getBrazeAuthToken);

export default router;
