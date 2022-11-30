import * as PromiseRouter from 'express-promise-router';
import addResourceInternal from '../../middleware/add-resource-internal';
import { DashboardActionReason } from '../../../../models';
import {
  ALL_ADMIN_INTERNAL_ROLES,
  ALL_CUSTOMER_SUPPORT_INTERNAL_ROLES,
} from '../../../../models/internal-role';
import requireInternalRole from '../../middleware/require-internal-role';
import create from './create';
import getAll from './get-all';
import patch from './patch';

const router = PromiseRouter();

router.use(requireInternalRole(ALL_CUSTOMER_SUPPORT_INTERNAL_ROLES));

router.param('id', addResourceInternal(DashboardActionReason));

router.get('/', getAll);

router.patch('/:id', requireInternalRole(ALL_ADMIN_INTERNAL_ROLES), patch);

router.post('/', requireInternalRole(ALL_ADMIN_INTERNAL_ROLES), create);

export default router;
