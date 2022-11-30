import * as PromiseRouter from 'express-promise-router';
import addResourceInternal from '../../middleware/add-resource-internal';
import { SynapsepayDocument } from '../../../../models';
import { ALL_CUSTOMER_SUPPORT_INTERNAL_ROLES } from '../../../../models/internal-role';
import requireInternalRole from '../../middleware/require-internal-role';
import getDuplicates from './get-duplicates';
import refresh from './refresh';
import swap from './swap';

const router = PromiseRouter();

router.use(requireInternalRole(ALL_CUSTOMER_SUPPORT_INTERNAL_ROLES));

router.param('id', addResourceInternal(SynapsepayDocument));

router.get('/:id/duplicates', getDuplicates);

router.post('/:id/refresh', refresh);
router.post('/swap', swap);

export default router;
