import * as PromiseRouter from 'express-promise-router';
import { Router } from 'express';
import { requireAuth, internalAuth } from '../../middleware';

import internalRouter from './api/internal/router';
import externalRouter from './api/external/router';

const router: Router = PromiseRouter();

router.use('/v1', requireAuth, externalRouter);
router.use('/internal/v1', internalAuth, internalRouter);

export default router;
