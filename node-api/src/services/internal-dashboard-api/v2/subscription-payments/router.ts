import * as PromiseRouter from 'express-promise-router';
import addResourceInternal from '../../middleware/add-resource-internal';
import { SubscriptionPayment } from '../../../../models';
import { ALL_CUSTOMER_SUPPORT_INTERNAL_ROLES } from '../../../../models/internal-role';
import requireInternalRole from '../../middleware/require-internal-role';
import refund from './refund';

const router = PromiseRouter();

router.use(requireInternalRole(ALL_CUSTOMER_SUPPORT_INTERNAL_ROLES));

router.param('id', addResourceInternal(SubscriptionPayment));

router.post('/:id/refund', refund);

export default router;
