/**
 * The goals:
 * 1. I want a simple call site, where the user gets:
 *   a. Type safety
 *   b. Only declaring the queue information once.
 * 2. type structure and queue information for one job type stick together
 *
 * Acceptable:
 * `ZenDeskJob({ job, data }).send();` Something that knows where to send, and provides type information on what to send.
 * `SendToGoogleTasks(ZenDeskData(job, data));` Something that knows how to send can figure out based on the thing it's passed
 * Less good:
 * `SendToGoogleTasks(anyPayload, 'zendesk';);` needs type safety between payload and queue information
 * `SendToGoogleTasks(ZenDeskData(job, data), 'zendeskJobData'); `Repeats `zendesk` data twice.
 */
import * as config from 'config';
import { SynapsePayUserUpdateFields } from 'synapsepay';

import { IQueueInfo } from '@dave-inc/google-cloud-tasks-helpers';
import { Moment } from '@dave-inc/time-lib';

import { AppsflyerProperties, BrazeUpdateAttributes, BrazeUpdateEvent } from '../../typings';

export * from './bank-connection-refresh';
import { SUBSCRIPTION_COLLECTION_TRIGGER } from '../../domain/collection';
import generateLoggingCreator from './generate-logging-creator';

// ACH Collection
const ACH_COLLECTION_INFO: IQueueInfo = config.get(
  'googleCloud.tasks.handlers.performACHCollection',
);

export type PerformACHCollectionPayload = {
  advanceIds: number[];
};

export const createACHCollectionTask = generateLoggingCreator<PerformACHCollectionPayload>(
  ACH_COLLECTION_INFO,
);

export type UpdateBrazePayload = {
  userId: number;
  attributes?: BrazeUpdateAttributes;
  eventProperties?: BrazeUpdateEvent | BrazeUpdateEvent[];
};

const UPDATE_BRAZE_INFO: IQueueInfo = config.get('googleCloud.tasks.handlers.updateBraze');

export const updateBrazeTask = generateLoggingCreator<UpdateBrazePayload>(UPDATE_BRAZE_INFO);

export type UpdateSynapsePayUserPayload = {
  userId: number;
  options?: { ip?: string; fields?: SynapsePayUserUpdateFields };
};

const UPDATE_SYNAPSEPAY_USER_INFO: IQueueInfo = config.get(
  'googleCloud.tasks.handlers.updateSynapsepayUser',
);

export const updateSynapsepayUserTask = generateLoggingCreator<UpdateSynapsePayUserPayload>(
  UPDATE_SYNAPSEPAY_USER_INFO,
);

const FRAUD_CHECK_INFO: IQueueInfo = config.get('googleCloud.tasks.handlers.performFraudCheck');

export type PerformFraudCheckPayload = {
  userId: number;
};

export const createFraudCheckTask = generateLoggingCreator<PerformFraudCheckPayload>(
  FRAUD_CHECK_INFO,
);

const UPDATE_PENDING_SUBSCRIPTION_PAYMENT_INFO: IQueueInfo = config.get(
  'googleCloud.tasks.handlers.updatePendingSubscriptionPayment',
);

export type UpdatePendingSubscriptionPaymentPayload = {
  subscriptionPaymentId: number;
};

export const createUpdatePendingSubscriptionPaymentTask = generateLoggingCreator<
  UpdatePendingSubscriptionPaymentPayload
>(UPDATE_PENDING_SUBSCRIPTION_PAYMENT_INFO);

// Refresh Sanctions Screening
const REFRESH_SANCTIONS_SCREENING_INFO: IQueueInfo = config.get(
  'googleCloud.tasks.handlers.refreshSanctionsScreening',
);

export type RefreshSanctionsScreeningPayload = {
  userId: number;
};

export const refreshSanctionsScreening = generateLoggingCreator<RefreshSanctionsScreeningPayload>(
  REFRESH_SANCTIONS_SCREENING_INFO,
);

const COLLECT_AFTER_BANK_ACCOUNT_UPDATE_INFO: IQueueInfo = config.get(
  'googleCloud.tasks.handlers.collectAfterBankAccountUpdate',
);

export type CollectPayload = {
  bankAccountId: number;
  updatedAt: string;
};

export const createCollectAfterBankAccountUpdateTask = generateLoggingCreator<CollectPayload>(
  COLLECT_AFTER_BANK_ACCOUNT_UPDATE_INFO,
);

const COLLECT_AFTER_BANK_ACCOUNT_UPDATE_SCHEDULED_INFO: IQueueInfo = config.get(
  'googleCloud.tasks.handlers.collectAfterBankAccountUpdateScheduled',
);

export const createCollectAfterBankAccountUpdateScheduledTask = generateLoggingCreator<
  CollectPayload
>(COLLECT_AFTER_BANK_ACCOUNT_UPDATE_SCHEDULED_INFO);

const SET_SUBSCRIPTION_DUE_DATE_INFO: IQueueInfo = config.get(
  'googleCloud.tasks.handlers.setSubscriptionDueDate',
);

export type SetSubscriptionDueDatePayload = { subscriptionBillingId: number };

export const createSetSubscriptionDueDateTask = generateLoggingCreator<
  SetSubscriptionDueDatePayload
>(SET_SUBSCRIPTION_DUE_DATE_INFO);

const MATCH_DISBURSEMENT_BANK_TRANSACTION_INFO: IQueueInfo = config.get(
  'googleCloud.tasks.handlers.matchDisbursementBankTransaction',
);

export type MatchDisbursementBankTransactionData = {
  bankConnectionId: number;
};

export const createMatchDisbursementBankTransactionTask = generateLoggingCreator<
  MatchDisbursementBankTransactionData
>(MATCH_DISBURSEMENT_BANK_TRANSACTION_INFO);

const BROADCAST_BANK_DISCONNECT_INFO: IQueueInfo = config.get(
  'googleCloud.tasks.handlers.broadcastBankDisconnect',
);

export type BroadcastBankDisconnectPayload = {
  userId: number;
  institutionId: number;
  bankConnectionId: number;
  time: number;
};

export const createBroadcastBankDisconnectTask = generateLoggingCreator<
  BroadcastBankDisconnectPayload
>(BROADCAST_BANK_DISCONNECT_INFO);

export type PastDueSubscriptionCollectionData = {
  userId: number;
  trigger: SUBSCRIPTION_COLLECTION_TRIGGER;
  shouldSkipBalanceCheck?: boolean;
  time?: Moment;
};

const COLLECT_PAST_DUE_SUBSCRIPTION_INFO: IQueueInfo = config.get(
  'googleCloud.tasks.handlers.collectPastDueSubscription',
);
export const collectPastDueSubscriptionTask = generateLoggingCreator<
  PastDueSubscriptionCollectionData
>(COLLECT_PAST_DUE_SUBSCRIPTION_INFO);

export type PredictedPaycheckCollectionData = {
  advanceId: number;
  bankAccountId: number;
  recurringTransactionId: number;
  achLimit?: number;
};

const PREDICTED_PAYCHECK_COLLECTION_INFO: IQueueInfo = config.get(
  'googleCloud.tasks.handlers.performPredictedPaycheckCollection',
);

export const performPredictedPaycheckCollection = generateLoggingCreator<
  PredictedPaycheckCollectionData
>(PREDICTED_PAYCHECK_COLLECTION_INFO);

// Advance Approval
const ADVANCE_APPROVAL_INFO: IQueueInfo = config.get(
  'googleCloud.tasks.handlers.broadcastAdvanceApproval',
);

export type BroadcastAdvanceApprovalData = {
  bankAccountId: number;
};

export const broadcastAdvanceApprovalTask = generateLoggingCreator<BroadcastAdvanceApprovalData>(
  ADVANCE_APPROVAL_INFO,
);

// Advance Disbursement
const ADVANCE_DISBURSEMENT_INFO: IQueueInfo = config.get(
  'googleCloud.tasks.handlers.broadcastAdvanceDisbursement',
);

export type BroadcastAdvanceDisbursementPayload = AppsflyerProperties & {
  advanceId: number;
};

export const broadcastAdvanceDisbursementTask = generateLoggingCreator<
  BroadcastAdvanceDisbursementPayload
>(ADVANCE_DISBURSEMENT_INFO);

// Advance Payment
const ADVANCE_PAYMENT_INFO: IQueueInfo = config.get(
  'googleCloud.tasks.handlers.broadcastAdvancePayment',
);

export type BroadcastAdvancePaymentPayload = {
  paymentId: number;
};

export const broadcastAdvancePaymentTask = generateLoggingCreator<BroadcastAdvancePaymentPayload>(
  ADVANCE_PAYMENT_INFO,
);

// Advance Tip Changed
const ADVANCE_TIP_CHANGED_INFO: IQueueInfo = config.get(
  'googleCloud.tasks.handlers.broadcastAdvanceTipChanged',
);

export type BroadcastAdvanceTipChangedPayload = {
  advanceId: number;
  amount: number;
} & AppsflyerProperties;

export const broadcastAdvanceTipChangedTask = generateLoggingCreator<
  BroadcastAdvanceTipChangedPayload
>(ADVANCE_TIP_CHANGED_INFO);
export type BroadcastPaymentChangedData = {
  paymentId: number;
  time?: string;
};

const PAYMENT_CHANGED_INFO: IQueueInfo = config.get(
  'googleCloud.tasks.handlers.broadcastPaymentChanged',
);

export const broadcastPaymentChangedTask = generateLoggingCreator<BroadcastPaymentChangedData>(
  PAYMENT_CHANGED_INFO,
);

// UpdatePaymentStatus
export type UpdatePaymentStatusQueueData = {
  paymentId: number;
};

const UPDATE_PAYMENT_STATUS_INFO: IQueueInfo = config.get(
  'googleCloud.tasks.handlers.updatePaymentStatus',
);

export const createUpdatePaymentStatusTask = generateLoggingCreator<UpdatePaymentStatusQueueData>(
  UPDATE_PAYMENT_STATUS_INFO,
);

// UpdateReimbursementStatus
export type UpdateReimbursementStatusQueueData = {
  reimbursementId: number;
};

const UPDATE_REIMBURSEMENT_STATUS_INFO: IQueueInfo = config.get(
  'googleCloud.tasks.handlers.updateReimbursementStatus',
);

export const createUpdateReimbursementStatusTask = generateLoggingCreator<
  UpdateReimbursementStatusQueueData
>(UPDATE_REIMBURSEMENT_STATUS_INFO);

export type SideHustleNotificationsData = {
  applicationIds: number[];
  userId: number;
};

const SIDE_HUSTLE_NOTIFICATIONS_INFO: IQueueInfo = config.get(
  'googleCloud.tasks.handlers.sideHustleNotifications',
);

export const sideHustleNotificationsTask = generateLoggingCreator<SideHustleNotificationsData>(
  SIDE_HUSTLE_NOTIFICATIONS_INFO,
);

export type SubscriptionCollectionPredictedPaydayQueueData = {
  subscriptionBillingId: number;
  bankAccountId: number;
  recurringTransactionId: number;
};

const SUBSCRIPTION_COLLECTION_PREDICTED_PAYDAY_INFO: IQueueInfo = config.get(
  'googleCloud.tasks.handlers.subscriptionCollectionPredictedPayday',
);

export const createSubscriptionCollectionPredictedPaydayTask = generateLoggingCreator<
  SubscriptionCollectionPredictedPaydayQueueData
>(SUBSCRIPTION_COLLECTION_PREDICTED_PAYDAY_INFO);

export type StitchOldAccountTransactionsData = {
  bankConnectionId: number;
};

const STITCH_OLD_ACCOUNT_TRANSACTIONS: IQueueInfo = config.get(
  'googleCloud.tasks.handlers.stitchOldAccountTransactions',
);

export const createStitchOldAccountTransactionsTask = generateLoggingCreator<
  StitchOldAccountTransactionsData
>(STITCH_OLD_ACCOUNT_TRANSACTIONS);

export type UpdateDisbursementStatusData = {
  advanceId: number;
};

const UPDATE_DISBUSEMENT_STATUS_INFO: IQueueInfo = config.get(
  'googleCloud.tasks.handlers.updateDisbursementStatus',
);

export const createUpdateDisbursementStatusTask = generateLoggingCreator<
  UpdateDisbursementStatusData
>(UPDATE_DISBUSEMENT_STATUS_INFO);

export type ProcessDashboardBulkUpdateData = {
  bucketName: string;
  dashboardBulkUpdateId: number;
  internalUserId: number;
};

const PROCESS_DASHBOARD_BULK_UPDATE_INFO: IQueueInfo = config.get(
  'googleCloud.tasks.handlers.processDashboardBulkUpdate',
);

export const createProcessDashboardBulkUpdateTask = generateLoggingCreator<
  ProcessDashboardBulkUpdateData
>(PROCESS_DASHBOARD_BULK_UPDATE_INFO);
