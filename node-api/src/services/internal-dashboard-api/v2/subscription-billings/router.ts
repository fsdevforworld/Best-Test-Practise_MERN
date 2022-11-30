import * as PromiseRouter from 'express-promise-router';
import addResourceInternal from '../../middleware/add-resource-internal';
import { SubscriptionBilling } from '../../../../models';
import { ALL_CUSTOMER_SUPPORT_INTERNAL_ROLES } from '../../../../models/internal-role';
import requireInternalRole from '../../middleware/require-internal-role';
import get from './get';
import giveFreeMonths from './give-free-months';
import waive from './waive';

const router = PromiseRouter();

router.use(requireInternalRole(ALL_CUSTOMER_SUPPORT_INTERNAL_ROLES));

router.param('id', addResourceInternal(SubscriptionBilling));

router.get('/:id', get);

router.post('/:id/waive', waive);
router.post('/free-months', giveFreeMonths);

export default router;
