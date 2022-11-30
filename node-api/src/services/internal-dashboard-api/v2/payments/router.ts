import * as PromiseRouter from 'express-promise-router';
import addResourceInternal from '../../middleware/add-resource-internal';
import { Payment } from '../../../../models';
import { ALL_CUSTOMER_SUPPORT_INTERNAL_ROLES } from '../../../../models/internal-role';
import requireInternalRole from '../../middleware/require-internal-role';

import get from './get';
import updateStatus from './update-status';
import refresh from './refresh';

const router = PromiseRouter();

router.use(requireInternalRole(ALL_CUSTOMER_SUPPORT_INTERNAL_ROLES));

router.param('id', addResourceInternal(Payment));

router.get('/:id', get);
router.patch('/:id/status', updateStatus);
router.post('/:id/refresh', refresh);

export default router;
