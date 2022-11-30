import * as PromiseRouter from 'express-promise-router';
import { Router } from 'express';

import { track } from './controller';

const router: Router = PromiseRouter();
router.post('/track', track);

export default router;
