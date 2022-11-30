import * as Bluebird from 'bluebird';
import { compact, map, omit } from 'lodash';
import {
  DashboardAction,
  DashboardActionReason,
  DashboardActionLog,
  DashboardAdvanceModification,
  DashboardSubscriptionBillingModification,
  DashboardUserModification,
  DashboardActionLogEmailVerification,
  Reimbursement,
  AdvanceRefund,
  AdvanceRefundLineItem,
} from '../../../../src/models';
import { ActionCode } from '../../../../src/services/internal-dashboard-api/domain/action-log';

interface IDashboardActionsWithReasons extends Pick<DashboardAction, 'name' | 'code'> {
  reasons?: Array<Partial<DashboardActionReason>>;
}

const otherReason = { reason: 'Other', noteRequired: true };
const bulkUpdateReasons = [
  { reason: 'Compliance requested' },
  { reason: 'High risk DD rule' },
  otherReason,
];
// Alphatbetizing by code
const actions: IDashboardActionsWithReasons[] = [
  {
    name: 'Activate account',
    code: ActionCode.ActivateAccount,
    reasons: [{ reason: 'Activate' }],
  },
  {
    name: 'Change advance disbursement status',
    code: ActionCode.AdvanceDisbursementStatusChange,
    reasons: [{ reason: 'Canceled' }, { reason: 'Completed' }],
  },
  {
    name: 'Update advance payment status',
    code: ActionCode.AdvancePaymentStatusChange,
    reasons: [{ reason: 'Canceled' }, { reason: 'Completed' }],
  },
  {
    name: 'Update fee',
    code: ActionCode.AdvanceFeeChange,
    reasons: [{ reason: 'Late delivery' }, otherReason],
  },
  {
    name: 'Update payback date',
    code: ActionCode.AdvancePaybackDateChange,
    reasons: [
      { reason: 'Incorrect payback date (user error)' },
      { reason: 'Incorrect payback date (bug/Dave error)' },
      { reason: 'Courtesy extension' },
      otherReason,
    ],
  },
  {
    name: 'Update tip',
    code: ActionCode.AdvanceTipChange,
    reasons: [{ reason: 'Overpaid tip' }, otherReason],
  },
  {
    name: 'Archive bank connection',
    code: ActionCode.ArchiveBankConnection,
    reasons: [{ reason: 'Member request' }, { reason: 'Bug troubleshooting' }, otherReason],
  },
  {
    name: 'Close account',
    code: ActionCode.CloseAccount,
    reasons: [
      { reason: 'Can’t borrow' },
      { reason: 'Not worth $1/month' },
      { reason: 'Not useful' },
      { reason: 'Duplicate account' },
      otherReason,
    ],
  },
  {
    name: 'Waive cool-off period',
    code: ActionCode.CoolOffPeriodWaive,
    reasons: [{ reason: 'Accidentally deleted' }, { reason: 'Recycled phone number' }, otherReason],
  },
  {
    name: 'Create advance refund',
    code: ActionCode.CreateAdvanceRefund,
    reasons: [{ reason: 'Refund' }],
  },
  {
    name: 'Create advance repayment',
    code: ActionCode.CreateAdvanceRepayment,
    reasons: [{ reason: 'Advance repayment' }],
  },
  {
    name: 'Update unverified email address',
    code: ActionCode.CreateEmailVerification,
    reasons: [
      { reason: 'Customer no longer uses email on file' },
      { reason: 'Customer prefers this email' },
      otherReason,
    ],
  },
  {
    name: 'Create user note',
    code: ActionCode.CreateUserNote,
    reasons: [{ reason: 'Agent note' }],
  },
  {
    name: 'Freeze payback',
    code: ActionCode.FreezeAdvancePayback,
    reasons: [{ reason: 'ACH revoke' }, { reason: 'Bankruptcy claims' }, otherReason],
  },
  {
    name: 'Give free months',
    code: ActionCode.GiveFreeMonths,
    reasons: [
      { reason: 'Known issue - bug pending resolution' },
      { reason: 'Unable to advance - courtesy' },
      { reason: 'Unaware of fee - continue using Dave' },
      otherReason,
    ],
  },
  {
    name: 'Pause account',
    code: ActionCode.PauseAccount,
    reasons: [
      { reason: 'Not eligible for an advance' },
      { reason: 'Hardship' },
      { reason: 'Not useful' },
      otherReason,
    ],
  },
  {
    name: 'Change goal for recurring goal transfer',
    code: ActionCode.RecurringGoalsTransferChangeGoal,
    reasons: [
      { reason: 'App not working' },
      { reason: 'Member filled out information incorrectly' },
      { reason: 'Member doesn’t know how to change settings' },
      otherReason,
    ],
  },
  {
    name: 'Change recurrence for recurring goal transfer',
    code: ActionCode.RecurringGoalsTransferChangeRecurrence,
    reasons: [
      { reason: 'App not working' },
      { reason: 'Member filled out information incorrectly' },
      { reason: 'Member doesn’t know how to change settings' },
      otherReason,
    ],
  },
  {
    name: 'Change amount for recurring goal transfer',
    code: ActionCode.RecurringGoalsTransferChangeAmount,
    reasons: [
      { reason: 'App not working' },
      { reason: 'Member filled out information incorrectly' },
      { reason: 'Member doesn’t know how to change settings' },
      otherReason,
    ],
  },
  {
    name: 'Refund subscription',
    code: ActionCode.RefundSubscription,
    reasons: [
      { reason: 'Subscription fee caused overdraft' },
      { reason: 'Failed microdeposit - cannot link account' },
      { reason: 'Courtesy - customer advance request rejected' },
      otherReason,
    ],
  },
  {
    name: 'Run approval',
    code: ActionCode.RunApproval,
    reasons: [{ reason: 'Approval run' }],
  },
  {
    name: 'Unfreeze payback',
    code: ActionCode.UnfreezeAdvancePayback,
    reasons: [{ reason: 'Unfreeze' }],
  },
  {
    name: 'Update default bank account',
    code: ActionCode.UpdateDefaultBankAccount,
    reasons: [{ reason: 'Set default' }],
  },
  {
    name: 'Update address',
    code: ActionCode.UserAddressChange,
    reasons: [{ reason: 'Incorrectly entered' }, { reason: 'Customer moved' }, otherReason],
  },
  {
    name: 'Update date of birth',
    code: ActionCode.UserBirthdateChange,
    reasons: [{ reason: 'Incorrectly entered' }, otherReason],
  },
  {
    name: 'Update first name',
    code: ActionCode.UserFirstNameChange,
    reasons: [{ reason: 'Legal name change' }, { reason: 'Misspelled' }, otherReason],
  },
  {
    name: 'Update last name',
    code: ActionCode.UserLastNameChange,
    reasons: [{ reason: 'Legal name change' }, { reason: 'Misspelled' }, otherReason],
  },
  {
    name: 'Update phone number',
    code: ActionCode.UserPhoneNumberChange,
    reasons: [{ reason: 'No longer in use' }, { reason: 'Incorrectly entered' }, otherReason],
  },
  {
    name: 'Waive advance outstanding balance',
    code: ActionCode.WaiveAdvanceOutstanding,
    reasons: [
      { reason: 'Member appeasement' },
      { reason: 'Dave error' },
      { reason: 'ACH revoke' },
      { reason: 'Bankruptcy' },
      otherReason,
    ],
  },
  {
    name: 'Waive subscription',
    code: ActionCode.WaiveSubscription,
    reasons: [
      { reason: 'Subscription fee caused overdraft' },
      { reason: 'Failed microdeposit - cannot link account' },
      { reason: 'Courtesy - customer advance request rejected' },
      otherReason,
    ],
  },
  {
    name: 'Cancel recurring goals transfer',
    code: ActionCode.CancelRecurringGoalsTransfer,
    reasons: [
      { reason: 'Member request' },
      { reason: 'Troubleshooting' },
      { reason: 'App error' },
      otherReason,
    ],
  },
  {
    name: 'Bulk Update Fraud Block',
    code: ActionCode.BulkUpdateFraudBlock,
    reasons: bulkUpdateReasons,
  },
  {
    name: 'Bulk Update Account Closure',
    code: ActionCode.BulkUpdateAccountClosure,
    reasons: bulkUpdateReasons,
  },
  {
    name: 'Bulk Update Admin Note',
    code: ActionCode.BulkUpdateAdminNote,
    reasons: bulkUpdateReasons,
  },
  {
    name: 'Update Goal Status',
    code: ActionCode.UpdateGoalStatus,
    reasons: [
      { reason: 'Member request' },
      { reason: 'Troubleshooting' },
      { reason: 'App Error' },
      otherReason,
    ],
  },
  {
    name: 'Download monthly statement',
    code: ActionCode.DownloadMonthlyStatement,
    reasons: [{ reason: 'Fed complaint' }, otherReason],
  },
  {
    name: 'Bulk Update CST Cancel Without Refund',
    code: ActionCode.BulkUpdateCstCancelWithoutRefund,
    reasons: bulkUpdateReasons,
  },
  {
    name: 'Bulk Update CST Suspend',
    code: ActionCode.BulkUpdateCstSuspend,
    reasons: bulkUpdateReasons,
  },
];

type NewReason = Pick<DashboardActionReason, 'dashboardActionId' | 'reason'>;

const buildDashboardActionReasons = (dashboardActions: DashboardAction[]): NewReason[] => {
  const dashboardActionIdsByCode: Record<
    DashboardAction['code'],
    DashboardAction['id']
  > = dashboardActions.reduce((accum, { code, id }) => ({ ...accum, [code]: id }), {});

  const dashboardActionReasons = actions.reduce((accum, { code, reasons }) => {
    if (!reasons?.length) {
      return accum;
    }

    const newReasons = reasons.map(reason => ({
      ...reason,
      dashboardActionId: dashboardActionIdsByCode[code],
    }));

    return [...accum, ...newReasons];
  }, []);

  return dashboardActionReasons;
};

async function up() {
  await DashboardAction.bulkCreate(
    actions.map(action => omit(action, 'reasons')),
    { updateOnDuplicate: ['name'] },
  );

  const dashboardActions = await DashboardAction.findAll();

  const dashboardActionReasons = buildDashboardActionReasons(dashboardActions);

  // we want to ignore duplicates and not crash when we add to `reasonsByActionName` and re-seed
  await DashboardActionReason.bulkCreate(dashboardActionReasons, {
    validate: true,
    ignoreDuplicates: true,
  });
}

async function down() {
  const dashboardActions: DashboardAction[] = await Bluebird.map(actions, ({ name }) =>
    DashboardAction.findOne({
      where: {
        name,
      },
    }),
  );

  const actionIdsToDestroy = map(compact(dashboardActions), 'id');

  const dashboardActionReasons: DashboardActionReason[] = await DashboardActionReason.findAll({
    where: { dashboardActionId: actionIdsToDestroy },
  });

  const reasonIdsToDestroy = map(compact(dashboardActionReasons), 'id');

  const dashboardActionLogs: DashboardActionLog[] = await DashboardActionLog.findAll({
    where: { dashboardActionReasonId: reasonIdsToDestroy },
  });

  const logIdsToDestroy = map(compact(dashboardActionLogs), 'id');

  await DashboardSubscriptionBillingModification.destroy({
    where: {
      dashboardActionLogId: logIdsToDestroy,
    },
  });

  await DashboardUserModification.destroy({
    where: {
      dashboardActionLogId: logIdsToDestroy,
    },
  });

  await DashboardAdvanceModification.destroy({
    where: {
      dashboardActionLogId: logIdsToDestroy,
    },
  });

  await DashboardActionLogEmailVerification.destroy({
    where: {
      dashboardActionLogId: logIdsToDestroy,
    },
  });

  const affectedReimbursements = await Reimbursement.findAll({
    where: { dashboardActionLogId: logIdsToDestroy },
  });

  await Bluebird.each(affectedReimbursements, async reimbursement => {
    const advanceRefunds = await AdvanceRefund.findAll({
      where: { reimbursementId: reimbursement.id },
    });
    await Bluebird.each(advanceRefunds, async advanceRefund => {
      await AdvanceRefundLineItem.destroy({ where: { advanceRefundId: advanceRefund.id } });
      await advanceRefund.destroy();
    });
    await reimbursement.destroy();
  });

  await DashboardActionLog.destroy({
    where: {
      id: logIdsToDestroy,
    },
  });

  await DashboardActionReason.destroy({
    where: {
      id: reasonIdsToDestroy,
    },
  });

  await DashboardAction.destroy({
    where: {
      id: actionIdsToDestroy,
    },
  });
}

export { up, down };
