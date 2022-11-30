import * as PromiseRouter from 'express-promise-router';
import bankAccount from './bank-account';
import bankConnection from './bank-connection';
import bankConnectionUpdate from './bank-connection-update';
import bankTransaction from './bank-transaction';
import externalTransaction from './external-transaction';
import fraudAlert from './fraud-alert';
import paymentMethod from './payment-method';
import recurringTransaction from './recurring-transaction';
import rewards from './rewards';
import user from './user';
import userAppVersion from './user-app-version';
import { Router } from 'express';
import approvalFlow from './approval-flow';
import daveBanking from './dave-banking';
import { get as getCurrentUser } from './current-user';

const router: Router = PromiseRouter();

router.get('/', (req, res) => res.send({ ok: true }));

router.get('/user/search', user.search);
router.get('/user/details/:id', user.details);
router.put('/user/:id', user.update);

// Force micro deposit as complete
router.patch(
  '/bank_account/:id/force_micro_deposit_complete',
  bankAccount.forceMicroDepositComplete,
);

router.get('/bank_account/details/:id', bankAccount.details);
router.put('/bank_connection/:id/credentials', bankConnection.setCredentialsValidity);
router.post('/bank_connection/:id/refresh', bankConnection.refresh);
router.delete('/bank_connection/:id', bankConnection.deleteById);

// Dave Banking
router.get('/dave_banking/user/:id', daveBanking.user);

// Rewards
router.get('/rewards/:userId', rewards.getByUserId);

// Delete payment method
router.delete('/payment_method/:id', paymentMethod.deleteById);

// Get deleted details
router.get('/user/deleted_details/:id', user.deletedDetails);

// Gets account with duplicate payment methods
router.get('/user/duplicate_payment_method', user.duplicatePaymentMethods);

router.get('/payment_method/:id/fetch', paymentMethod.getAccountById);

router.post('/admin_comment', user.createAdminComment);
router.delete('/admin_comment/:id', user.deleteAdminComment);

router.get('/audit_log/:id', user.auditLog);

router.post('/admin_paycheck_override', user.createAdminPaycheckOverride);
router.delete('/admin_paycheck_override/:id', user.deleteAdminPaycheckOverride);

// Verification code
router.post('/user/send_verification_code', user.sendVerificationCode);
router.post('/user/validate_verification_code', user.validateVerificationCode);

router.patch('/fraud_alert/:id', fraudAlert.patch);

router.get('/user/:userId/recurring_transaction', recurringTransaction.getByUserId);
router.post('/user/:userId/recurring_transaction', recurringTransaction.create);
router.patch('/recurring_transaction/:recurringTransactionId', recurringTransaction.update);
router.delete('/recurring_transaction/:recurringTransactionId', recurringTransaction.deleteById);
router.get(
  '/recurring_transaction/:recurringTransactionId/expected_transaction',
  recurringTransaction.getExpectedTransactions,
);

router.get('/user/:userId/bank_transaction', bankTransaction.getSixtyDaysAgo);

router.get('/user/:userId/bank_connection_update', bankConnectionUpdate.getByUserId);

router.get('/user/:userId/user_app_version', userAppVersion.getByUserId);

router.get('/external_transaction/search', externalTransaction.search);

// Approval Flow Diagram
router.get('/approval_flow', approvalFlow.generateAdvanceApprovalGraph);

router.get('/current_user', getCurrentUser);

export default router;
