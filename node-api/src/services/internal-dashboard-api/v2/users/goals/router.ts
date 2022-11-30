import * as PromiseRouter from 'express-promise-router';
import getTransfers from './get-transfers';
import updateStatus from './update-status';

const router = PromiseRouter();

router.get('/:goalId/transfers', getTransfers);

router.patch('/:goalId/status', updateStatus);

export default router;
