import { get as getConfig } from 'config';
import { Router } from 'express';
import * as PromiseRouter from 'express-promise-router';
import { partial } from 'lodash';
import {
  addResource,
  filesUpload,
  imageUpload,
  minVersionCheck,
  MinVersionType,
  requireActiveMembership,
  requireAuth,
} from '../../middleware';
import { CUSTOM_ERROR_CODES } from '../../lib/error';
import { BankConnection as BankConnectionModel } from '../../models';
import { InvalidParametersMessageKey } from '../../translations';
import advance, { MIN_VERSION as MIN_VERSION_ADVANCE } from './advance';
import bankAccount, { MIN_VERSION_ADD_ACCOUNT_ROUTING } from './bank-account';
import bankConnection, { MIN_VERSION_LINK_TOKEN } from './bank-connection';
import bankTransaction from './bank-transaction';
import bankWaitlist from './bank-waitlist';
import * as campaignInfo from './campaign-info';
import ccpaRequest from './ccpa-request';
import config from './config';
import * as creditPop from './credit-pop';
import emailVerification from './email-verification';
import help from './help';
import identityVerification from './identity-verification';
import incident from './incident';
import institution from './institutions';
import membershipPause from './membership-pause';
import messaging from './messaging';
import metric from './metric';
import onboardingStep from './onboarding-step';
import overdraft from './overdraft';
import payment from './payment';
import * as paymentMethod from './payment-method';
import phoneNumberChangeRequest, {
  MIN_VERSION as MIN_VERSION_PHONE_NUMBER_CHANGE,
} from './phone-number-change-request';
import recurring from './recurring';
import * as rewards from './rewards';
import sideHustleApplications from './side-hustle-applications';
import sideHustleJobs from './side-hustle/jobs';
import * as HustleController from './hustle';
import * as subscriptionBilling from './subscription-billing';
import * as subscriptionBillingPromotion from './subscription-billing-promotion';
import subscriptionPayment from './subscription-payment';
import * as user from './user';
import userFeedback from './user-feedback';
import * as userNotification from './user-notification';
import * as deepLink from './deep-link';

const bankingHelpCenterRedisKey = getConfig<string>('helpCenter.bankingRedisKey');
const overdraftHelpCenterRedisKey = getConfig<string>('helpCenter.overdraftRedisKey');
const advanceHelpCenterRedisKey = getConfig<string>('helpCenter.advanceRedisKey');
const minVersionConfig = getConfig<string>('minAppVersion.config');

const router: Router = PromiseRouter();

// Config
router.get(
  '/config',
  minVersionCheck(minVersionConfig, MinVersionType.ERROR, {
    error: {
      message: 'Please update to the latest version of Dave',
      customCode: CUSTOM_ERROR_CODES.FORCE_APP_RE_INSTALL, // force update client
    },
  }),
  config.get,
);

// Deprecated: use POST /user/verify_number or POST /user/send_verification
router.post(
  '/user/verify',
  minVersionCheck(user.MIN_VERSION_SEND_VERIFICATION, MinVersionType.FALLBACK),
  user.verifyNumberOrSendVerification,
);
router.post('/user/verify', user.oldSendVerification);

// Create / log in a user
router.post('/user', user.create);
router.post(
  '/user/login',
  minVersionCheck(user.MIN_VERSION_LOGIN, MinVersionType.ERROR, {
    error: {
      message: InvalidParametersMessageKey.LoginMinVersionError,
    },
  }),
  user.loginWithCredentials,
);
router.patch('/user/change_password', requireAuth, user.changePassword);
router.post('/user/confirm_password', requireAuth, user.confirmPassword);
router.post(
  '/user/reset_password',
  minVersionCheck(user.MIN_VERSION_RESET_PASSWORD, MinVersionType.ERROR, {
    error: {
      message: InvalidParametersMessageKey.ResetPasswordMinVersionError,
    },
  }),
  user.resetPassword,
);
router.patch('/user/set_email_password', requireAuth, user.setEmailPassword);
router.post(
  '/user/dave_banking/identity_verification',
  minVersionCheck(user.MIN_VERSION_IDENTITY_VERIFICATION, MinVersionType.ERROR, {
    error: {
      message: InvalidParametersMessageKey.SendVerificationMinVersionError,
    },
  }),
  user.verifyDaveBankingSSN,
);
router.patch('/user/set_email_password/:token', user.setEmailPassword);
// Deprecated: use POST /user/reset_password
router.post(
  '/user/send_reset_password_email',
  minVersionCheck(user.MIN_VERSION_RESET_PASSWORD, MinVersionType.ERROR, {
    error: {
      message: InvalidParametersMessageKey.ResetPasswordMinVersionError,
    },
  }),
);

router.post('/user/reset_password/dave_banking/verify_code', user.verifyResetPasswordCode);
router.post(
  '/user/send_verification',
  minVersionCheck(user.MIN_VERSION_LOGIN, MinVersionType.ERROR, {
    error: {
      message: InvalidParametersMessageKey.SendVerificationMinVersionError,
    },
  }),
  user.sendVerification,
);
router.post('/user/verify_number', user.verifyNumber);
router.post('/user/verify_code', user.verifyCode);
router.post('/user/verify_address', requireAuth, user.verifyAddressInfo);
// Get the logged in user
router.get('/user', requireAuth, user.get);
// Update the profile/settings of the user
router.patch('/user', requireAuth, user.update);
router.patch('/user/name', requireAuth, imageUpload, user.updateName);
// Delete a user's account
router.delete('/user/:id', requireAuth, user.del);
// Get firebase credentials
router.get('/user/credentials/firebase', requireAuth, user.getFirebaseCredentials);
// Get externalId
router.get('/user/external_id', requireAuth, user.getExternalId);
router.get('/user/account_checks', requireAuth, user.performAccountChecks);
// Get information needed for user to make bank connection
router.post('/bank_connection_session', requireAuth, bankConnection.session);
// Almost the same as v2/bank_connection_session, but this is for backwards compatibility
router.post(
  '/user/credentials/mx_connection_info',
  requireAuth,
  bankConnection.generateMxConnectionInfo,
);
// Temporary: COVID-19 jobloss subscription billing holiday
router.post('/user/covid_19_jobloss', requireAuth, subscriptionBillingPromotion.covid19Jobloss);

// Create a bank of dave bank connection
router.post('/bank_connection', requireAuth, bankConnection.create);
// Get the plaid auth token for an account
router.get('/bank_connection/:connectionId/token', requireAuth, bankConnection.getToken);
// Get link token from plaid
router.post(
  '/bank_connection/link_token',
  requireAuth,
  minVersionCheck(MIN_VERSION_LINK_TOKEN, MinVersionType.ERROR, {
    error: {
      message: 'Please update to the latest version of Dave',
      customCode: CUSTOM_ERROR_CODES.FORCE_APP_RE_INSTALL, // force update client
    },
  }),
  bankConnection.getItemAddToken,
);
router.post(
  '/bank_connection/:connectionId/validate',
  requireAuth,
  bankConnection.setCredentialsValid,
);
router.get(
  '/bank_connection/:bankConnectionId/transition',
  requireAuth,
  addResource(BankConnectionModel, 'params.bankConnectionId'),
  bankConnection.listTransitions,
);

// Get all the bank accounts
router.get('/bank_account', requireAuth, bankAccount.getAll);
// Update main paycheck for bank account
router.patch('/bank_account/:id', requireAuth, bankAccount.patch);
// Delete a bank account (will delete all for bank connection
router.delete('/bank_account/:id', requireAuth, bankAccount.del);
//refresh bank account balances and transactions
router.post('/bank_account/:bankAccountId/refresh', requireAuth, bankAccount.userRefresh);

// Get a public encryption key for payment methods
router.get('/encryption_key', paymentMethod.getEncryptionKey);

// Auth protected since it costs some money.
router.post('/verify_card', requireAuth, paymentMethod.verifyEncryptedCard);

// Create/replace a payment method
router.post(
  '/bank_account/:bankAccountId/payment_method',
  requireAuth,
  minVersionCheck(paymentMethod.MIN_VERSION, MinVersionType.ERROR, {
    error: { message: 'Please update your app to add your debit card' },
  }),
  paymentMethod.create,
);

router.patch('/payment_method/:paymentMethodId', requireAuth, paymentMethod.update);

// Get recent expenses for a bank account
router.get('/bank_account/:bankAccountId/expenses', requireAuth, bankTransaction.getExpenses);
// Get recent incomes for a bank account
router.get('/bank_account/:bankAccountId/incomes', requireAuth, bankTransaction.getIncomes);
// Get all recent transactions for a bank account
router.get('/bank_account/:bankAccountId/transactions', requireAuth, bankTransaction.getRecent);
router.get(
  '/bank_account/:bankAccountId/transactions/:transactionId',
  requireAuth,
  bankTransaction.getById,
);

// Create a recurring expense for a bank account
router.get('/bank_account/:bankAccountId/recurring_expense', requireAuth, recurring.getExpenses);
router.get('/bank_account/:bankAccountId/paychecks', requireAuth, recurring.detectPaychecks);
router.get(
  '/bank_account/:bankAccountId/predicted_expenses',
  requireAuth,
  recurring.detectExpenses,
);
router.post('/bank_account/:bankAccountId/recurring_expense', requireAuth, recurring.create);
router.post(
  '/bank_account/:bankAccountId/recurring_expense/bulk',
  requireAuth,
  recurring.saveBulkExpenses,
);
router.patch(
  '/bank_account/:bankAccountId/recurring_expense/:transactionId',
  requireAuth,
  recurring.update,
);
router.delete(
  '/bank_account/:bankAccountId/recurring_expense/:transactionId',
  requireAuth,
  recurring.del,
);
// add notifications for bank account advances
router.post('/bank_account/:bankAccountId/notification', requireAuth, bankAccount.notification);
router.delete(
  '/bank_account/:bankAccountId/notification',
  requireAuth,
  bankAccount.delNotification,
);
// Create a recurring income for a bank account
router.get('/bank_account/:bankAccountId/recurring_income', requireAuth, recurring.getIncomes);
router.post('/bank_account/:bankAccountId/recurring_income', requireAuth, recurring.create);
router.patch(
  '/bank_account/:bankAccountId/recurring_income/:transactionId',
  requireAuth,
  recurring.update,
);
router.delete(
  '/bank_account/:bankAccountId/recurring_income/:transactionId',
  requireAuth,
  recurring.del,
);
// get recurring transaction by id (expense or income)
router.get(
  '/bank_account/:bankAccountId/recurring_transaction/:transactionId',
  requireAuth,
  recurring.get,
);

router.post(
  '/bank_account/:bankAccountId/add_account_routing',
  requireAuth,
  minVersionCheck(MIN_VERSION_ADD_ACCOUNT_ROUTING, MinVersionType.ERROR, {
    error: {
      message: 'Please update to the latest version of Dave',
      customCode: CUSTOM_ERROR_CODES.FORCE_APP_RE_INSTALL, // force update client
    },
  }),
  bankAccount.addAccountRouting,
);
router.post(
  '/bank_account/:bankAccountId/recreate_micro_deposit',
  requireAuth,
  bankAccount.recreateMicroDeposit,
);
router.post(
  '/bank_account/:bankAccountId/verify_micro_deposit',
  requireAuth,
  bankAccount.verifyMicroDeposit,
);

// Make a payment on an advance
router.post('/advance/:advanceId/payment', requireAuth, payment.create);
// Get the fees for an advance dollar amount.
router.get('/advance/fees', advance.fees);
// Get advance engine static ruleset values
router.get('/advance/rules', requireAuth, advance.rules);
// Get approval status + terms for an advance
router.get('/advance/terms', requireAuth, advance.terms);
// Request an advance
router.post(
  '/advance',
  requireAuth,
  minVersionCheck(MIN_VERSION_ADVANCE, MinVersionType.ERROR, {
    error: {
      message: 'Please update to the latest version of Dave',
    },
  }),
  advance.request,
);
// Update an advance (tip)
router.patch('/advance/:id', requireAuth, imageUpload, advance.update);
// Upload screenshot to GCloud
router.post('/advance/upload_screenshot', requireAuth, imageUpload, advance.upload);
// Upload screenshot to GCloud for new O2 service
router.post('/overdraft/upload_screenshot', requireAuth, imageUpload, overdraft.uploadScreenshot);

// Get a user's advances
router.get('/advance', requireAuth, advance.get);
// Get a specific advance by encoded JWT token, used by web payback form
router.get('/advance/:token', advance.getAdvanceByToken);

// Submit identity verification
router.post('/identity_verification', requireAuth, identityVerification.submit);
// Submit a government ID for verification
router.patch(
  '/identity_verification',
  requireAuth,
  imageUpload,
  identityVerification.submitGovernmentId,
);
// Get ID verification status
router.get('/identity_verification', requireAuth, identityVerification.getStatus);

router.get('/incident', requireAuth, incident.get);

router.get('/institution/:id/status', requireAuth, institution.getStatus);

// Get the user's completed onboarding steps
router.get('/onboarding_step', requireAuth, onboardingStep.get);
// Add a completed onboarding step for the user
router.post('/onboarding_step', requireAuth, onboardingStep.create);
// Roll back a onboarding step for the user
router.post('/delete_onboarding_steps', requireAuth, onboardingStep.remove);

// Request a phone number change
router.post(
  '/phone_number_change_request',
  minVersionCheck(MIN_VERSION_PHONE_NUMBER_CHANGE, MinVersionType.ERROR, {
    error: {
      message: 'Please update your app to change your phone number',
      metric: 'phone_number_change_request.update_app',
    },
  }),
  phoneNumberChangeRequest.post,
);

// Verify phone number change via bank info
router.patch('/phone_number_change_request/:id', phoneNumberChangeRequest.update);
// Verify phone number change via email link
router.get('/phone_number_change_request/:id/verify', phoneNumberChangeRequest.verify);
// Phone number change from duplicate account
router.post(
  '/phone_number_change_request/reclaim',
  requireAuth,
  phoneNumberChangeRequest.reclaimPreviousAccount,
);

// Logged in user phone number change verification text
router.post(
  '/phone_number_change/text_verification',
  requireAuth,
  phoneNumberChangeRequest.verifyWithText,
);

// Update user last_active field
router.get('/metric/last_active', requireAuth, metric.active);
router.post('/metric/ab_testing_event', requireAuth, metric.trackAbTestingEvent);

// Verify an email address
router.get('/email_verification/verify/:token', emailVerification.verify);
// check for duplicates
router.get('/email_verification/check_duplicate', emailVerification.checkDuplicate);
// Get latest email verification
router.get('/email_verification', requireAuth, emailVerification.latest);
// Update email verification (email address)
router.patch('/email_verification/:id', requireAuth, emailVerification.update);

// Handle incoming text messages from our users
router.post('/messaging/incoming', messaging.incoming);
// Handle incoming calls from our users
router.post('/messaging/voice', messaging.voice);

router.post('/token_payment', payment.createWithToken);

router.get('/subscription_billing', requireAuth, subscriptionBilling.get);
router.post(
  '/subscription_billing/two_months_free',
  requireAuth,
  subscriptionBilling.twoMonthsFree,
);
router.post(
  '/subscription_billing_promotion/:promotionCode/redeem',
  requireAuth,
  subscriptionBillingPromotion.triggerPromotion,
);
router.get('/subscription_billing_promotions', requireAuth, subscriptionBillingPromotion.get);
router.post('/subscription_payment', requireAuth, subscriptionPayment.create);

// Hustle
router.get('/hustles/categories', requireAuth, HustleController.getCategories);
router.get('/hustles/job_packs', requireAuth, HustleController.getJobPacks);
router.get('/hustles/saved_hustles', requireAuth, HustleController.getSavedHustles);
router.post(
  '/hustles/saved_hustles',
  requireAuth,
  requireActiveMembership,
  HustleController.saveHustle,
);
router.delete(
  '/hustles/saved_hustles/:hustleId',
  requireAuth,
  requireActiveMembership,
  HustleController.unsaveHustle,
);
router.get('/hustles', requireAuth, requireActiveMembership, HustleController.search);
router.get('/hustles/:hustleId', requireAuth, requireActiveMembership, HustleController.get);

// legacy side hustle
router.get('/side_hustle_jobs', requireAuth, requireActiveMembership, sideHustleJobs.get);
router.post(
  '/side_hustle_applications',
  requireAuth,
  requireActiveMembership,
  sideHustleApplications.upsert,
);
router.get(
  '/side_hustle_applications',
  requireAuth,
  requireActiveMembership,
  sideHustleApplications.get,
);

router.post('/user_feedback', requireAuth, userFeedback.create);

router.get('/help_topics', help.topics);
router.get('/help/chat_agent_count', requireAuth, help.chatAgentCount);
router.get('/help/help_center/article/:id', requireAuth, help.helpCenterArticle);
router.get('/help/help_center', requireAuth, partial(help.helpCenter, bankingHelpCenterRedisKey));
router.get(
  '/help/help_center/advance',
  requireAuth,
  partial(help.helpCenter, advanceHelpCenterRedisKey),
);
router.get(
  '/help/help_center/overdraft',
  requireAuth,
  partial(help.helpCenter, overdraftHelpCenterRedisKey),
);
router.post('/help/help_center/article/:id/vote', requireAuth, help.voteArticleUpOrDown);
router.post('/help/ticket', requireAuth, filesUpload, help.createHelpRequest);
router.get('/help/user_ticket_reasons', requireAuth, help.getUserTicketReasons);

// Add user to the bank waitlist
router.post('/bank_waitlist', requireAuth, requireActiveMembership, bankWaitlist.create);

/** Rewards endpoints */
router.get('/rewards/offers', requireAuth, rewards.getOffers);
router.get('/rewards/auth', requireAuth, rewards.getAuth);
router.delete('/rewards/card', requireAuth, rewards.deleteCard);
router.get('/rewards/transactions', requireAuth, rewards.getRewardTransactions);
router.post('/rewards/offers/link/:id', requireAuth, rewards.linkOffer);
router.post('/empyr_webhook/rewards', rewards.create);

/** Credit Pop endpoint */
router.post('/credit_pop', requireAuth, creditPop.create);

router.get('/campaign_info', campaignInfo.get);
router.post('/campaign_info', campaignInfo.post);
router.post('/appsflyer_webhook/campaign_info', campaignInfo.webhookPost);

// TODO: remove after updating AppsFlyer settings.
router.post('/appsflyer_webhook/post_install', campaignInfo.webhookPost);

router.get('/user_notification', requireAuth, userNotification.getNotifications);
router.patch('/user_notification/:id', requireAuth, userNotification.updateNotification);

// Pause membership
router.post('/membership_pause', requireAuth, membershipPause.create);
router.delete('/membership_pause', requireAuth, membershipPause.resumeMembership);

// Deep-link handling
router.get('/deep-link', deepLink.get);
router.post('/ccpa_request', ccpaRequest.create);

export default router;
