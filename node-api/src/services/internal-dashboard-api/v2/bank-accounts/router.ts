import * as PromiseRouter from 'express-promise-router';
import addResourceInternal from '../../middleware/add-resource-internal';
import { BankAccount } from '../../../../models';
import { ALL_CUSTOMER_SUPPORT_INTERNAL_ROLES } from '../../../../models/internal-role';
import requireInternalRole from '../../middleware/require-internal-role';
import getBankTransactions from './get-bank-transactions';
import getDailyBalanceLogs from './get-daily-balance-logs';
import monthlyStatements from './monthly-statements';

const router = PromiseRouter();

router.use(requireInternalRole(ALL_CUSTOMER_SUPPORT_INTERNAL_ROLES));

router.use('/:id/monthly-statements', monthlyStatements);

router.param('id', addResourceInternal(BankAccount));

router.get('/:id/bank-transactions', getBankTransactions);

// this fails locally (dev env) due to heath dependency issue - https://demoforthedaves.atlassian.net/browse/CI-1208
router.get('/:id/daily-balance-logs', getDailyBalanceLogs);

export default router;
