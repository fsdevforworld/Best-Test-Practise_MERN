import { Router } from 'express';
import * as PromiseRouter from 'express-promise-router';
import SegmentUser from './segment-user';
import { requireAuth } from '../../middleware';

const router: Router = PromiseRouter();
router.post('/segment-user', requireAuth, SegmentUser.createSegmentUser);

export default router;
