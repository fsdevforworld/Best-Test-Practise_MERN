import { Router } from 'express';
import * as PromiseRouter from 'express-promise-router';
import ensureRequestIdExists from '../../middleware/ensure-request-id-exists';
import { userAuthenticate, refreshAccess, revoke, exchange } from './controller';

const router: Router = PromiseRouter();
router.use(ensureRequestIdExists);
router.post('/v1/userAuth/authenticate', userAuthenticate);
router.post('/v1/userAuth/refreshAccess', refreshAccess);
router.post('/v1/userAuth/exchange', exchange);
router.delete('/v1/userAuth/revoke', revoke);

export default router;
