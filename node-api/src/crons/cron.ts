export type Cron = {
  name: DaveCron;
  process: () => Promise<any> | any;
  schedule: string;
  successfulJobsHistoryLimit?: number;
  startingDeadlineSeconds?: number;
  concurrencyPolicy?: CronConcurrencyPolicy;
  suspend?: boolean;
  envVars?: { [key: string]: string };
};

export enum CronConcurrencyPolicy {
  Allow = 'Allow', // Default - The cron job allows concurrently running jobs
  Forbid = 'Forbid', // The cron job does not allow concurrent runs; if it is time for a new job run and the previous job run hasn’t finished yet, the cron job skips the new job run
  Replace = 'Replace', // If it is time for a new job run and the previous job run hasn’t finished yet, the cron job replaces the currently running job run with a new job run
}

export enum DaveCron {
  AchMicroDepositVerification = 'ach-micro-deposit-verification',
  AchReturnRepayment = 'ach-return-repayment',
  AppsflyerPull = 'appsflyer-pull',
  AutoAdvanceApproval = 'auto-advance-approval',
  BucketTivanAdvance = 'bucket-tivan-advance',
  CollectAdvanceBlindWithdrawal = 'collect-advance-blind-withdrawal',
  CollectPaybackDateBlindWithdrawal = 'collect-payback-date-blind-withdrawal',
  CollectPredictedPaycheckBlindWithdrawal = 'collect-predicted-paycheck-blind-withdrawal',
  CollectSubscriptionRecentAccountUpdate = 'collect-subscription-recent-account',
  CreateSubscriptionBillings = 'create-subscription-billings',
  DisputeChargeBacks = 'dispute-chargebacks',
  EmailSynapsepayStatements = 'email-synapsepay-statements',
  FetchAndStoreReadReplicaLag = 'fetch-and-store-read-replica-lag',
  FlagFraudulentActivity = 'flag-fraudulent-activity',
  IngestReviews = 'ingest-reviews',
  IngestTransactionSettlements = 'ingest-transaction-settlements',
  MarkRecurringTransactionsAsMissed = 'mark-recurring-transactions-missed',
  MonitorAdvanceCollection = 'monitor-advance-collection',
  MultiOutstandingAdvance = 'multi-outstanding-advance',
  NotifyPendingAdvances = 'notify-pending-advances',
  PublishCollectAdvanceAfterTwoDaysExperiment = 'publish-collect-advance-after-two-days-experiment',
  PublishCollectAdvanceTimezoneExperiment = 'publish-collect-advance-timezone-experiment',
  PublishCollectBigMoneyHardPulls = 'publish-collect-big-money-hard-pulls',
  PublishCollectTinyMoneyHardPulls = 'publish-collect-tiny-money-hard-pulls',
  PublishCollectNoOverdraftAdvance = 'publish-collect-no-overdraft-advance',
  PublishCollectScheduledAdvance = 'publish-collect-scheduled-advance',
  PublishCollectScheduledTivanAdvances = 'publish-collect-schedule-tivan-advances',
  PublishCollectTivanAdvances = 'publish-collect-tivan-advances',
  PublishSubscriptionCollectionPredictedPayday = 'subscription-collection-predicted-payday',
  Reconnect = 'reconnect',
  RequestReviewAfterAdvance = 'request-review-after-advance',
  RefundOverchargedAdvances = 'refund-overcharged-advances',
  SchedulePaydayPastDueRepayment = 'schedule-payday-past-due-repayment',
  SetAllowBankSignUps = 'set-allow-bank-sign-ups',
  SetSubscriptionDueDates = 'set-subscription-due-dates',
  SynapsepayBalanceCheck = 'synapsepay-balance-check',
  UnableToCollectAlert = 'unable-to-collect-alert',
  UpdateChatAgentCount = 'update-chat-agent-count',
  UpdateCompletedSynapsePayments = 'update-completed-synapse-payments',
  UpdateHelpCenters = 'update-help-centers',
  UpdatePendingPayments = 'update-pending-payments',
  UpdatePendingAdvances = 'update-pending-advances',
  UpdatePendingDashboardAdvanceRepayments = 'update-pending-dashboard-advance-repayments',
  UpdatePendingReimbursements = 'update-pending-reimbursements',
  UpdatePendingSubscriptionPayments = 'update-pending-subscription-payments',
}
