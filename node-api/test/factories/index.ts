import { factory, SequelizeAdapter } from 'factory-girl';
import { sequelize } from '../../src/models';
import abTestingEvent from './ab-testing-event';
import adminComment from './admin-comment';
import adminPaycheckOverride from './admin-paycheck-override';
import advance from './advance';
import advanceApproval from './advance-approval';
import advanceCollectionAttempt from './advance-collection-attempt';
import advanceCollectionSchedule from './advance-collection-schedule';
import advanceExperiment from './advance-experiment';
import advanceExperimentLog from './advance-experiment-log';
import advanceNodeLog from './advance-node-log';
import advancePaybackDatePrediction from './advance-payback-date-prediction';
import advanceRefund from './advance-refund';
import advanceRefundLineItem from './advance-refund-line-item';
import advanceRuleLog from './advance-rule-log';
import advanceTip from './advance-tip';
import auditLog from './audit-log';
import bankAccount from './bank-account';
import bankConnection from './bank-connection';
import bankConnectionRefresh from './bank-connection-refresh';
import bankConnectionTransition from './bank-connection-transition';
import bankConnectionUpdate from './bank-connection-update';
import bankTransaction from './bank-transaction';
import bankingDirectUserSession from './banking-direct-user-session';
import bodTransaction from './bod-transaction';
import campaignInfo from './campaign-info';
import config from './config';
import createApprovalResponse from './create-approval-response';
import creditPopCode from './credit-pop-code';
import dashboardAction from './dashboard-action';
import dashboardActionLog from './dashboard-action-log';
import dashboardActionLogEmailVerification from './dashboard-action-log-email-verification';
import dashboardActionReason from './dashboard-action-reason';
import dashboardAdvanceApproval from './dashboard-advance-approval';
import dashboardAdvanceModification from './dashboard-advance-modification';
import dashboardAdvanceRepayment from './dashboard-advance-repayment';
import dashboardBulkUpdate from './dashboard-bulk-update';
import dashboardNotePriority from './dashboard-note-priority';
import dashboardPayment from './dashboard-payment';
import dashboardPaymentMethodModification from './dashboard-payment-method-modification';
import dashboardPaymentModification from './dashboard-payment-modification';
import dashboardRecurringGoalsTransferModification from './dashboard-recurring-goals-transfer-modification';
import dashboardSubscriptionBillingModification from './dashboard-subscription-billing-modification';
import dashboardUserModification from './dashboard-user-modification';
import dashboardUserNote from './dashboard-user-note';
import daveBankingCallSession from './dave-banking-call-session';
import deepLink from './deep-link';
import dehydratedBaseDocument from './dehydrated-base-document';
import dehydratedSynapsepayUser from './dehydrated-synapsepay-user';
import deleteRequest from './delete-request';
import donationOrganization from './donation-organization';
import emailVerification from './email-verification';
import empyrEvent from './empyr-event';
import expectedTransaction from './expected-transaction';
import externalPayment from './external-payment';
import fraudAlert from './fraud-alert';
import fraudRule from './fraud-rule';
import bdsBankTransaction from './heath/bank-transaction';
import hustleJobPack from './hustle-job-pack';
import hustleJobPackProvider from './hustle-job-pack-provider';
import hustleJobPackSearch from './hustle-job-pack-search';
import incident from './incident';
import institution from './institution';
import internalRole from './internal-role';
import internalUser from './internal-user';
import membershipPause from './membership-pause';
import merchantInfo from './merchant-info';
import mobilePayId from './mobile-pay-id';
import onboardingSteps from './onboarding-step';
import passwordHistory from './password-history';
import payment from './payment';
import paymentMethod from './payment-method';
import paymentReversal from './payment-reversal';
import phoneNumberChangeRequest from './phone-number-change-request';
import plaidStatusResponse from './plaid/status-response';
import pubSubEvent from './pub-sub-event';
import recurringTransaction from './recurring-transaction';
import redeemedSubscriptionBillingPromotion from './redeemed-subscription-billing-promotion';
import reimbursement from './reimbursement';
import rewardsLedger from './rewards-ledger';
import role from './role';
import sideHustle from './side-hustle';
import sideHustleApplication from './side-hustle-applications';
import sideHustleCategory from './side-hustle-category';
import sideHustleJob from './side-hustle-jobs';
import sideHustleProvider from './side-hustle-provider';
import sideHustleSavedJob from './side-hustle-saved-job';
import subscriptionBilling from './subscription-billing';
import subscriptionBillingPromotion from './subscription-billing-promotion';
import subscriptionCollectionAttempt from './subscription-collection-attempt';
import subscriptionPayment from './subscription-payment';
import subscriptionPaymentLineItem from './subscription-payment-line-item';
import synapsepayDocument from './synapsepay-document';
import synapsepayTransaction from './synapsepay-transaction';
import tabapayKey from './tabapay-key';
import tabapayResponse from './tabapay-response';
import transactionSettlement from './transaction-settlement';
import user from './user';
import userAddress from './user-address';
import userAppVersion from './user-app-version';
import userFeedback from './user-feedback';
import userIncident from './user-incident';
import userNotification from './user-notification';
import userRole from './user-role';
import userSession from './user-session';
import UserSetting from './user-setting';
import UserSettingName from './user-setting-name';
import DaveBankingPubSubTransaction from './dave-banking-pubsub-transaction';

factory.setAdapter(new SequelizeAdapter());
const loaders = [
  adminComment,
  adminPaycheckOverride,
  user,
  advanceRefund,
  advanceRefundLineItem,
  advanceTip,
  redeemedSubscriptionBillingPromotion,
  subscriptionBilling,
  subscriptionBillingPromotion,
  institution,
  bankConnection,
  bankConnectionRefresh,
  bankConnectionUpdate,
  bankConnectionTransition,
  bankAccount,
  bankTransaction,
  bdsBankTransaction,
  createApprovalResponse,
  dashboardAction,
  dashboardActionReason,
  dashboardActionLog,
  dashboardActionLogEmailVerification,
  dashboardAdvanceApproval,
  dashboardAdvanceModification,
  dashboardAdvanceRepayment,
  dashboardBulkUpdate,
  dashboardNotePriority,
  dashboardPayment,
  dashboardPaymentMethodModification,
  dashboardPaymentModification,
  dashboardRecurringGoalsTransferModification,
  dashboardSubscriptionBillingModification,
  dashboardUserModification,
  dashboardUserNote,
  daveBankingCallSession,
  DaveBankingPubSubTransaction,
  donationOrganization,
  fraudAlert,
  payment,
  paymentMethod,
  externalPayment,
  subscriptionPayment,
  subscriptionPaymentLineItem,
  recurringTransaction,
  emailVerification,
  expectedTransaction,
  userSession,
  userIncident,
  synapsepayDocument,
  auditLog,
  advance,
  advanceApproval,
  advanceExperiment,
  advanceExperimentLog,
  advanceNodeLog,
  advancePaybackDatePrediction,
  subscriptionCollectionAttempt,
  advanceCollectionAttempt,
  advanceCollectionSchedule,
  advanceRuleLog,
  hustleJobPack,
  hustleJobPackProvider,
  hustleJobPackSearch,
  sideHustle,
  sideHustleCategory,
  sideHustleApplication,
  sideHustleJob,
  sideHustleProvider,
  sideHustleSavedJob,
  userFeedback,
  tabapayKey,
  tabapayResponse,
  plaidStatusResponse,
  membershipPause,
  incident,
  merchantInfo,
  transactionSettlement,
  config,
  userAppVersion,
  pubSubEvent,
  empyrEvent,
  rewardsLedger,
  synapsepayTransaction,
  fraudRule,
  campaignInfo,
  userNotification,
  paymentReversal,
  reimbursement,
  role,

  bodTransaction,
  bankingDirectUserSession,
  creditPopCode,
  onboardingSteps,
  abTestingEvent,
  phoneNumberChangeRequest,
  dehydratedBaseDocument,
  dehydratedSynapsepayUser,
  deleteRequest,
  UserSetting,
  UserSettingName,
  userRole,
  deepLink,
  internalRole,
  internalUser,
  passwordHistory,
  mobilePayId,
  userAddress,
];

loaders.forEach(load => load(factory));

export let faktoryCreatedObjects: any[] = [];

export async function quickClean() {
  await sequelize.transaction(async t => {
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction: t });
    await Promise.all(
      faktoryCreatedObjects.map(async o => {
        if (o.destroy) {
          await o.destroy({ force: true, transaction: t });
        }
      }),
    );
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction: t });
  });
  faktoryCreatedObjects = [];
}

factory.withOptions({
  afterCreate: (model: any) => {
    faktoryCreatedObjects.push(model);
    return model;
  },
});

export default factory;
