import { getSequelizeInstance } from '../lib/sequelize';
import { isTestEnv } from '../lib/utils';
import ABTestingEvent from './ab-testing-event';
import AdminComment from './admin-comment';
import AdminPaycheckOverride from './admin-paycheck-override';
import Advance from './advance';
import AdvanceApproval from './advance-approval';
import AdvanceCollectionAttempt from './advance-collection-attempt';
import AdvanceCollectionSchedule from './advance-collection-schedule';
import AdvanceExperiment from './advance-experiment';
import AdvanceExperimentLog from './advance-experiment-log';
import AdvanceNodeLog from './advance-node-log';
import AdvancePaybackDatePrediction from './advance-payback-date-prediction';
import AdvanceRefund from './advance-refund';
import AdvanceRefundLineItem from './advance-refund-line-item';
import AdvanceRuleLog from './advance-rule-log';
import AdvanceTip from './advance-tip';
import Alert from './alert';
import AppStoreReview from './app-store-review';
import AuditLog from './audit-log';
import AVSLog from './avs-log';
import BalanceCheck from './balance-check';
import BankAccount from './bank-account';
import BankConnection from './bank-connection';
import BankConnectionRefresh from './bank-connection-refresh';
import BankConnectionTransition from './bank-connection-transition';
import BankingDirectUserSession from './banking-direct-user-session';
import BankTransaction from './bank-transaction';
import BankTransactionToken from './bank-transaction-token';
import CampaignInfo from './campaign-info';
import CampaignInfoContributor from './campaign-info-contributor';
import CCPARequest from './ccpa-request';
import Config from './config';
import CreativeSpend from './creative-spend';
import CreativeSpendAudit from './creative-spend-audit';
import CreditPopCode from './credit-pop-code';
import DailyBalanceLog from './daily-balance-log';
import DashboardAction from './dashboard-action';
import DashboardActionLog from './dashboard-action-log';
import DashboardActionLogBankConnection from './dashboard-action-log-bank-connection';
import DashboardActionLogEmailVerification from './dashboard-action-log-email-verification';
import DashboardActionLogDeleteRequest from './dashboard-action-log-delete-request';
import DashboardActionLogMembershipPause from './dashboard-action-log-membership-pause';
import DashboardActionReason from './dashboard-action-reason';
import DashboardAdvanceApproval from './dashboard-advance-approval';
import DashboardAdvanceModification from './dashboard-advance-modification';
import DashboardAdvanceRepayment from './dashboard-advance-repayment';
import DashboardBulkUpdate from './dashboard-bulk-update';
import DashboardBulkUpdateFraudRule from './dashboard-bulk-update-fraud-rule';
import DashboardNotePriority from './dashboard-note-priority';
import DashboardPayment from './dashboard-payment';
import DashboardPaymentMethodModification from './dashboard-payment-method-modification';
import DashboardPaymentModification from './dashboard-payment-modification';
import DashboardRecurringGoalsTransferModification from './dashboard-recurring-goals-transfer-modification';
import DashboardSubscriptionBillingModification from './dashboard-subscription-billing-modification';
import DashboardUserModification from './dashboard-user-modification';
import DashboardUserNote from './dashboard-user-note';
import DaveBankingCallSession from './dave-banking-call-session';
import DeepLink from './deep-link';
import DeleteRequest from './delete-request';
import DonationOrganization from './donation-organization';
import EmailVerification from './email-verification';
import EmpyrEvent from './empyr-event';
import ExpectedTransaction from './expected-transaction';
import FraudAlert from './fraud-alert';
import FraudRule from './fraud-rule';
import HustleJobPack from './hustle-job-pack';
import HustleJobPackProvider from './hustle-job-pack-provider';
import HustleJobPackSearch from './hustle-job-pack-search';
import Incident from './incident';
import Institution from './institution';
import InternalRole from './internal-role';
import InternalRoleAssignment from './internal-role-assignment';
import InternalUser from './internal-user';
import MembershipPause from './membership-pause';
import MerchantInfo from './merchant-info';
import MobilePayID from './mobile-pay-id';
import Notification from './notification';
import OnboardingStep from './onboarding-step';
import PasswordHistory from './password-history';
import Payment from './payment';
import PaymentMethod from './payment-method';
import PaymentReversal from './payment-reversal';
import PhoneNumberChangeRequest from './phone-number-change-request';
import RecurringTransaction from './recurring-transaction';
import RedeemedSubscriptionBillingPromotion from './redeemed-subscription-billing-promotion';
import Reimbursement from './reimbursement';
import RewardsLedger from './rewards-ledger';
import Role from './role';
import SideHustle from './side-hustle';
import SideHustleApplication from './side-hustle-application';
import SideHustleCategory from './side-hustle-category';
import SideHustleJob from './side-hustle-job';
import SideHustleProvider from './side-hustle-provider';
import SideHustleSavedJob from './side-hustle-saved-job';
import SubscriptionBilling from './subscription-billing';
import SubscriptionBillingPromotion from './subscription-billing-promotion';
import SubscriptionCollectionAttempt from './subscription-collection-attempt';
import SubscriptionPayment from './subscription-payment';
import SubscriptionPaymentLineItem from './subscription-payment-line-item';
import SupportUserView from './support-user-view';
import SynapsepayDocument from './synapsepay-document';
import TabapayKey from './tabapay-key';
import ThirdPartyName from './third-party-name';
import TransactionSettlement from './transaction-settlement';
import TransactionSettlementProcessedFile from './transaction-settlement-processed-file';
import User from './user';
import UserAppVersion from './user-app-version';
import UserFeedback from './user-feedback';
import UserIncident from './user-incident';
import UserIpAddress from './user-ip-address';
import UserNotification from './user-notification';
import UserRole from './user-role';
import UserSession from './user-session';
import UserSetting from './user-setting';
import UserSettingName from './user-setting-name';
import UserAddress from './user-address';
import { Sequelize } from 'sequelize-typescript';
import DashboardGoalModification from './dashboard-goal-modification';
import DashboardActionLogMonthlyStatement from './dashboard-action-log-monthly-statement';

const models = {
  ABTestingEvent,
  AdminComment,
  AdminPaycheckOverride,
  Advance,
  AdvanceApproval,
  AdvanceCollectionAttempt,
  AdvanceCollectionSchedule,
  AdvanceExperiment,
  AdvanceExperimentLog,
  AdvanceNodeLog,
  AdvancePaybackDatePrediction,
  AdvanceRefund,
  AdvanceRefundLineItem,
  AdvanceRuleLog,
  AdvanceTip,
  Alert,
  AppStoreReview,
  AuditLog,
  AVSLog,
  BalanceCheck,
  BankAccount,
  BankConnection,
  BankConnectionRefresh,
  BankConnectionTransition,
  BankingDirectUserSession,
  BankTransaction,
  BankTransactionToken,
  CampaignInfo,
  CampaignInfoContributor,
  CCPARequest,
  Config,
  CreativeSpend,
  CreativeSpendAudit,
  CreditPopCode,
  DaveBankingCallSession,
  DashboardAction,
  DashboardActionLog,
  DashboardActionLogBankConnection,
  DashboardActionLogDeleteRequest,
  DashboardActionLogEmailVerification,
  DashboardActionLogMembershipPause,
  DashboardActionLogMonthlyStatement,
  DashboardActionReason,
  DashboardAdvanceApproval,
  DashboardAdvanceModification,
  DashboardAdvanceRepayment,
  DashboardBulkUpdate,
  DashboardBulkUpdateFraudRule,
  DashboardGoalModification,
  DashboardNotePriority,
  DashboardPayment,
  DashboardPaymentMethodModification,
  DashboardPaymentModification,
  DashboardRecurringGoalsTransferModification,
  DashboardSubscriptionBillingModification,
  DashboardUserModification,
  DashboardUserNote,
  DailyBalanceLog,
  DeepLink,
  DeleteRequest,
  DonationOrganization,
  EmailVerification,
  EmpyrEvent,
  ExpectedTransaction,
  FraudAlert,
  FraudRule,
  HustleJobPack,
  HustleJobPackProvider,
  HustleJobPackSearch,
  Incident,
  Institution,
  InternalRole,
  InternalRoleAssignment,
  InternalUser,
  MembershipPause,
  MobilePayID,
  MerchantInfo,
  Notification,
  OnboardingStep,
  PasswordHistory,
  Payment,
  PaymentMethod,
  PaymentReversal,
  PhoneNumberChangeRequest,
  RecurringTransaction,
  RedeemedSubscriptionBillingPromotion,
  Reimbursement,
  RewardsLedger,
  Role,
  SideHustle,
  SideHustleApplication,
  SideHustleCategory,
  SideHustleJob,
  SideHustleProvider,
  SideHustleSavedJob,
  SubscriptionBilling,
  SubscriptionBillingPromotion,
  SubscriptionCollectionAttempt,
  SubscriptionPayment,
  SubscriptionPaymentLineItem,
  SupportUserView,
  SynapsepayDocument,
  TabapayKey,
  ThirdPartyName,
  TransactionSettlement,
  TransactionSettlementProcessedFile,
  User,
  UserAppVersion,
  UserFeedback,
  UserIncident,
  UserIpAddress,
  UserNotification,
  UserRole,
  UserSession,
  UserSetting,
  UserSettingName,
  UserAddress,
};

let sequelize: Sequelize;

function initializeSequelize() {
  if (sequelize) {
    return;
  }

  sequelize = getSequelizeInstance(Object.values(models));
}

if (!isTestEnv()) {
  initializeSequelize();
}

export {
  ABTestingEvent,
  AdminComment,
  AdminPaycheckOverride,
  Advance,
  AdvanceApproval,
  AdvanceCollectionAttempt,
  AdvanceCollectionSchedule,
  AdvanceExperiment,
  AdvanceExperimentLog,
  AdvanceNodeLog,
  AdvancePaybackDatePrediction,
  AdvanceRefund,
  AdvanceRefundLineItem,
  AdvanceRuleLog,
  AdvanceTip,
  Alert,
  AppStoreReview,
  AuditLog,
  AVSLog,
  BalanceCheck,
  BankAccount,
  BankConnection,
  BankConnectionRefresh,
  BankConnectionTransition,
  BankingDirectUserSession,
  BankTransaction,
  BankTransactionToken,
  CampaignInfo,
  CampaignInfoContributor,
  CCPARequest,
  Config,
  CreativeSpend,
  CreativeSpendAudit,
  CreditPopCode,
  DashboardAction,
  DashboardActionLog,
  DashboardActionLogBankConnection,
  DashboardActionLogDeleteRequest,
  DashboardActionLogEmailVerification,
  DashboardActionLogMembershipPause,
  DashboardActionLogMonthlyStatement,
  DashboardActionReason,
  DashboardAdvanceApproval,
  DashboardAdvanceModification,
  DashboardAdvanceRepayment,
  DashboardBulkUpdate,
  DashboardBulkUpdateFraudRule,
  DashboardGoalModification,
  DashboardNotePriority,
  DashboardPayment,
  DashboardPaymentMethodModification,
  DashboardPaymentModification,
  DashboardRecurringGoalsTransferModification,
  DashboardSubscriptionBillingModification,
  DashboardUserModification,
  DashboardUserNote,
  DailyBalanceLog,
  DaveBankingCallSession,
  DeepLink,
  DeleteRequest,
  DonationOrganization,
  EmailVerification,
  EmpyrEvent,
  ExpectedTransaction,
  FraudAlert,
  FraudRule,
  HustleJobPack,
  HustleJobPackProvider,
  HustleJobPackSearch,
  Incident,
  Institution,
  InternalRole,
  InternalRoleAssignment,
  InternalUser,
  MembershipPause,
  MerchantInfo,
  MobilePayID,
  Notification,
  OnboardingStep,
  PasswordHistory,
  Payment,
  PaymentMethod,
  PaymentReversal,
  PhoneNumberChangeRequest,
  RecurringTransaction,
  RedeemedSubscriptionBillingPromotion,
  Reimbursement,
  RewardsLedger,
  Role,
  SideHustle,
  SideHustleApplication,
  SideHustleCategory,
  SideHustleJob,
  SideHustleProvider,
  SideHustleSavedJob,
  SubscriptionBilling,
  SubscriptionBillingPromotion,
  SubscriptionCollectionAttempt,
  SubscriptionPayment,
  SubscriptionPaymentLineItem,
  SupportUserView,
  SynapsepayDocument,
  TabapayKey,
  ThirdPartyName,
  TransactionSettlement,
  TransactionSettlementProcessedFile,
  User,
  UserAppVersion,
  UserFeedback,
  UserIncident,
  UserIpAddress,
  UserNotification,
  UserRole,
  UserSession,
  UserSetting,
  UserSettingName,
  UserAddress,
  initializeSequelize,
  sequelize,
};

export default models;
