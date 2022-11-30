import * as PromiseRouter from 'express-promise-router';
import create from './create';
import getAll from './get-all';
import csvFileUpload from '../../middleware/single-csv-upload';
import process from './process';
import requireInternalRole from '../../middleware/require-internal-role';
import { ALL_CUSTOMER_SUPPORT_INTERNAL_ROLES } from '../../../../models/internal-role';
import addResourceInternal from '../../middleware/add-resource-internal';
import { DashboardBulkUpdate } from '../../../../models';
import preview from './preview';
import download from './download';
import { partial } from 'lodash';
import get from './get';

const bulkUpdateAdmin = 'bulkUpdateAdmin';

const router = PromiseRouter();

router.use(requireInternalRole(ALL_CUSTOMER_SUPPORT_INTERNAL_ROLES));

router.param('id', addResourceInternal(DashboardBulkUpdate));

// Dave Dashboard bulk action endpoint
router.post('/', requireInternalRole([bulkUpdateAdmin]), csvFileUpload, create);
router.post(
  '/:id/process',
  requireInternalRole([bulkUpdateAdmin]),
  csvFileUpload,
  partial(process, false),
);
router.post(
  '/:id/process/async',
  requireInternalRole([bulkUpdateAdmin]),
  csvFileUpload,
  partial(process, true),
);

router.get('/', requireInternalRole([bulkUpdateAdmin]), getAll);
router.get('/:id', requireInternalRole([bulkUpdateAdmin]), get);
router.get('/:id/preview', requireInternalRole([bulkUpdateAdmin]), preview);
router.get('/:id/download', requireInternalRole([bulkUpdateAdmin]), download);

export default router;
