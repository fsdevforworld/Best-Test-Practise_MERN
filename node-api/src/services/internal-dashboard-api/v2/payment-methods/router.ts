import * as PromiseRouter from 'express-promise-router';
import { ALL_CUSTOMER_SUPPORT_INTERNAL_ROLES } from '../../../../models/internal-role';
import requireInternalRole from '../../middleware/require-internal-role';

import getChangelog from './get-changelog';

const router = PromiseRouter();

router.use(requireInternalRole(ALL_CUSTOMER_SUPPORT_INTERNAL_ROLES));

// note that this `id` is the `paymentMethodUniversalId` not `payment_method.id`
router.get('/:id/changelog', getChangelog);

export default router;
