import * as PromiseRouter from 'express-promise-router';
import addResourceInternal from '../../middleware/add-resource-internal';
import { DashboardAdvanceRepayment } from '../../../../models';
import { ALL_CUSTOMER_SUPPORT_INTERNAL_ROLES } from '../../../../models/internal-role';
import requireInternalRole from '../../middleware/require-internal-role';

import create from './create';
import refresh from './refresh';

const router = PromiseRouter();

router.use(requireInternalRole(ALL_CUSTOMER_SUPPORT_INTERNAL_ROLES));

router.param('id', addResourceInternal(DashboardAdvanceRepayment));

router.post('/', create);
router.post('/:id/refresh', refresh);

export default router;
