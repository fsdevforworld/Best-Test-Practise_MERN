import * as PromiseRouter from 'express-promise-router';
import advanceApprovals from './advance-approvals';
import advances from './advances';
import bankAccounts from './bank-accounts';
import bankConnections from './bank-connections';
import bankConnectionRefreshes from './bank-connection-refreshes';
import dashboardActionReasons from './dashboard-action-reasons';
import dashboardActions from './dashboard-actions';
import dashboardAdvanceRepayments from './dashboard-advance-repayments';
import dashboardBulkUpdates from './dashboard-bulk-updates';
import paymentMethods from './payment-methods';
import payments from './payments';
import subscriptionBillings from './subscription-billings';
import subscriptionPayments from './subscription-payments';
import synapsepayDocuments from './synapsepay-documents';
import users from './users';

const router = PromiseRouter();

router.use('/advance-approvals', advanceApprovals);
router.use('/advances', advances);
router.use('/bank-accounts', bankAccounts);
router.use('/bank-connections', bankConnections);
router.use('/bank-connection-refreshes', bankConnectionRefreshes);
router.use('/dashboard-action-reasons', dashboardActionReasons);
router.use('/dashboard-actions', dashboardActions);
router.use('/dashboard-advance-repayments', dashboardAdvanceRepayments);
router.use('/dashboard-bulk-updates', dashboardBulkUpdates);
router.use('/payment-methods', paymentMethods);
router.use('/payments', payments);
router.use('/subscription-billings', subscriptionBillings);
router.use('/subscription-payments', subscriptionPayments);
router.use('/synapsepay-documents', synapsepayDocuments);
router.use('/users', users);

export default router;
