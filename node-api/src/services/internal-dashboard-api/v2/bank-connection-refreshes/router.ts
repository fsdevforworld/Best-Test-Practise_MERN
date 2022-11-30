import * as PromiseRouter from 'express-promise-router';
import addResourceInternal from '../../middleware/add-resource-internal';
import { BankConnectionRefresh } from '../../../../models';
import { ALL_CUSTOMER_SUPPORT_INTERNAL_ROLES } from '../../../../models/internal-role';
import requireInternalRole from '../../middleware/require-internal-role';
import get from './get';
import create from './create';

const router = PromiseRouter();

router.use(requireInternalRole(ALL_CUSTOMER_SUPPORT_INTERNAL_ROLES));

router.param('id', addResourceInternal(BankConnectionRefresh));

router.get('/:id', get);
router.post('/', create);

export default router;
