import * as PromiseRouter from 'express-promise-router';
import addResourceInternal from '../../middleware/add-resource-internal';
import { Advance } from '../../../../models';
import { ALL_CUSTOMER_SUPPORT_INTERNAL_ROLES } from '../../../../models/internal-role';
import requireInternalRole from '../../middleware/require-internal-role';
import getChangelog from './get-changelog';
import createRefund from './create-refund';
import get from './get';
import freezePayback from './freeze-payback';
import unfreezePayback from './unfreeze-payback';
import updateFee from './update-fee';
import updatePaybackDate from './update-payback-date';
import updateTip from './update-tip';
import updateDisbursementStatus from './update-disbursement-status';
import waive from './waive';

const router = PromiseRouter();

router.use(requireInternalRole(ALL_CUSTOMER_SUPPORT_INTERNAL_ROLES));

router.param('id', addResourceInternal(Advance));

router.get('/:id', get);
router.get('/:id/changelog', getChangelog);

router.patch('/:id/disbursement-status', updateDisbursementStatus);
router.patch('/:id/fee', updateFee);
router.patch('/:id/payback-date', updatePaybackDate);
router.patch('/:id/tip', updateTip);

router.post('/:id/freeze-payback', freezePayback);
router.post('/:id/refunds', createRefund);
router.post('/:id/unfreeze-payback', unfreezePayback);
router.post('/:id/waive', waive);

export default router;
