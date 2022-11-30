import * as Bluebird from 'bluebird';
import { uniq } from 'lodash';
import { Model, ModelCtor, Op } from 'sequelize';
import { generateBankingDataSource } from '../../src/domain/banking-data-source';
import UserHelper, { deleteMxUser } from '../../src/helper/user';
import logger from '../../src/lib/logger';
import {
  ABTestingEvent,
  AdminComment,
  AdminPaycheckOverride,
  Advance,
  AdvanceApproval,
  AdvanceCollectionAttempt,
  AdvanceCollectionSchedule,
  AdvanceExperimentLog,
  AdvanceNodeLog,
  AdvancePaybackDatePrediction,
  AdvanceRuleLog,
  AdvanceTip,
  Alert,
  AuditLog,
  BankConnection,
  BankConnectionTransition,
  BankTransaction,
  CampaignInfo,
  DashboardAdvanceModification,
  DashboardUserModification,
  DashboardAdvanceRepayment,
  DashboardPayment,
  DaveBankingCallSession,
  DeleteRequest,
  EmailVerification,
  EmpyrEvent,
  ExpectedTransaction,
  FraudAlert,
  MembershipPause,
  OnboardingStep,
  PasswordHistory,
  Payment,
  PaymentMethod,
  PhoneNumberChangeRequest,
  RecurringTransaction,
  RedeemedSubscriptionBillingPromotion,
  Reimbursement,
  RewardsLedger,
  SideHustleApplication,
  SideHustleSavedJob,
  SubscriptionBilling,
  SubscriptionCollectionAttempt,
  SubscriptionPayment,
  SubscriptionPaymentLineItem,
  SupportUserView,
  SynapsepayDocument,
  User,
  UserAppVersion,
  UserFeedback,
  UserIpAddress,
  UserNotification,
  UserRole,
  UserSession,
  UserSetting,
  AdvanceRefund,
  AdvanceRefundLineItem,
  DashboardActionLog,
  DashboardActionLogEmailVerification,
  DashboardSubscriptionBillingModification,
  DashboardPaymentModification,
  DashboardUserNote,
} from '../../src/models';
import { removeBankAccountRelationships } from '../../src/services/loomis-api/domain/delete-bank-account';

async function deleteBankConnection(connection: BankConnection) {
  try {
    const bankingDataSource = await generateBankingDataSource(connection);
    await bankingDataSource.deleteNexus();
  } catch (err) {
    logger.error('Error deleting bank connection source', { err: err.message });
  }

  await removeBankAccountRelationships(connection);
  await BankConnectionTransition.destroy({
    where: {
      [Op.or]: [{ fromBankConnectionId: connection.id }, { toBankConnectionId: connection.id }],
    },
  });
  await connection.hardDelete();
}

export async function deleteDirectRelationships(userId: number) {
  const userIdClasses: Array<ModelCtor<Model<{ userId: number }>>> = [
    ABTestingEvent,
    AdminComment,
    AdminPaycheckOverride,
    DashboardUserModification,
    DashboardUserNote,
    Payment,
    Reimbursement,
    SubscriptionPayment,
    Advance,
    AdvanceExperimentLog,
    Alert,
    AuditLog,
    EmailVerification,
    EmpyrEvent,
    FraudAlert,
    MembershipPause,
    OnboardingStep,
    PaymentMethod,
    PhoneNumberChangeRequest,
    UserNotification,
    RecurringTransaction,
    SideHustleApplication,
    SideHustleSavedJob,
    SupportUserView,
    SynapsepayDocument,
    UserAppVersion,
    UserFeedback,
    UserIpAddress,
    UserSession,
    UserSetting,
    AdvanceApproval,
    CampaignInfo,
    RedeemedSubscriptionBillingPromotion,
    RewardsLedger,
    UserRole,
    DeleteRequest,
  ];

  await Bluebird.each(userIdClasses, uc => {
    return uc.destroy({ where: { userId }, force: true });
  });
}

async function deleteAdvanceRefundRelationships(advance: Advance) {
  const refunds = await AdvanceRefund.findAll({
    where: { advanceId: advance.id },
    include: [AdvanceRefundLineItem],
  });

  await Bluebird.each(refunds, async refund => {
    await Bluebird.all(refund.advanceRefundLineItems.map(lineItem => lineItem.destroy()));
    await refund.destroy();
  });
}

export async function deleteNestedRelationships(userId: number) {
  const approvals = await AdvanceApproval.findAll({ where: { userId } });
  await Bluebird.each(approvals, async approval => {
    await AdvanceNodeLog.destroy({ where: { advanceApprovalId: approval.id } });
    await AdvanceRuleLog.deleteByAdvanceApprovalId(approval.id);
    await AdvanceRuleLog.destroy({ where: { advanceApprovalId: approval.id } });
    await AdvanceExperimentLog.destroy({ where: { advanceApprovalId: approval.id } });
    await AdvancePaybackDatePrediction.destroy({
      where: { advanceApprovalId: approval.id },
      force: true,
    });
  });

  await DaveBankingCallSession.destroy({
    where: {
      customerId: userId,
    },
  });

  const advances = await Advance.findAll({ where: { userId }, paranoid: false });
  await Bluebird.each(advances, async advance => {
    await AdvanceTip.destroy({ where: { advanceId: advance.id }, force: true });
    await AdvanceCollectionAttempt.destroy({ where: { advanceId: advance.id } });
    await AdvanceCollectionSchedule.destroy({ where: { advanceId: advance.id } });

    const [reimbursementActionLogIds, modifications, paymentIds] = await Bluebird.all([
      Reimbursement.findAll({
        where: { advanceId: advance.id },
      }).map(reimbursement => reimbursement.dashboardActionLogId),
      DashboardAdvanceModification.findAll({
        where: { advanceId: advance.id },
        include: [DashboardActionLog],
      }),
      Payment.findAll({
        where: { advanceId: advance.id },
      }).map(payment => payment.id),
    ]);

    const [dashboardAdvanceRepayments, paymentModifications] = await Promise.all([
      DashboardAdvanceRepayment.findAll({
        where: { advanceId: advance.id },
      }),
      DashboardPaymentModification.findAll({
        where: { paymentId: paymentIds },
      }),
    ]);

    await Bluebird.each(dashboardAdvanceRepayments, async dashRepayment => {
      await DashboardPayment.destroy({
        where: {
          tivanTaskId: dashRepayment.tivanTaskId,
        },
        force: true,
      }),
        await dashRepayment.destroy({ force: true });
    });

    // `dashboard_*_modification` entries can share `action_log_id`s -- collect them to destroy
    const actionLogIds: number[] = [];

    await Bluebird.each(paymentModifications, async modification => {
      actionLogIds.push(modification.dashboardActionLogId);
      await modification.destroy();
    });

    await Bluebird.each(modifications, async modification => {
      if (!reimbursementActionLogIds.includes(modification.dashboardActionLogId)) {
        actionLogIds.push(modification.dashboardActionLogId);
      }
      await modification.destroy();
    });

    await deleteAdvanceRefundRelationships(advance);

    uniq(actionLogIds);
    await DashboardActionLog.destroy({
      where: {
        id: actionLogIds,
      },
    });
  });

  const subscriptionBilling = await SubscriptionBilling.findAll({ where: { userId } });
  await Bluebird.each(subscriptionBilling, async sub => {
    await Promise.all([
      SubscriptionPaymentLineItem.destroy({
        where: { subscriptionBillingId: sub.id },
        force: true,
      }),
      SubscriptionCollectionAttempt.destroy({
        where: { subscriptionBillingId: sub.id },
        force: true,
      }),
      DashboardSubscriptionBillingModification.destroy({
        where: { subscriptionBillingId: sub.id },
      }),
    ]);

    await sub.destroy({ force: true });
  });

  const subscriptionPayment = await SubscriptionPayment.findAll({ where: { userId } });
  await Bluebird.each(subscriptionPayment, async sub => {
    await SubscriptionPaymentLineItem.destroy({
      where: { subscriptionPaymentId: sub.id },
      force: true,
    });
  });

  const transactions = await BankTransaction.findAll({ where: { userId } });
  await Bluebird.each(transactions, async transaction => {
    await transaction.destroy({ force: true });
  });

  const expectedTransactions = await ExpectedTransaction.findAll({ where: { userId } });
  await Promise.all(expectedTransactions.map(tx => tx.destroy({ force: true })));

  const emailVerifications = await EmailVerification.findAll({ where: { userId } });
  await Bluebird.each(emailVerifications, async emailVerification => {
    const actionLogEmailVerifications = await DashboardActionLogEmailVerification.findAll({
      where: { emailVerificationId: emailVerification.id },
      include: [DashboardActionLog],
    });

    await Bluebird.each(actionLogEmailVerifications, async actionLogEmailVerification => {
      const actionLog = actionLogEmailVerification.dashboardActionLog;
      await actionLogEmailVerification.destroy();
      await actionLog.destroy();
    });
  });
}

export async function deleteDataForUser(user: User) {
  const userId = user.id;

  await Promise.all([
    user.mxUserId ? deleteMxUser(user) : null,
    SynapsepayDocument.destroy({ where: { userId } }),
  ]);

  await deleteNestedRelationships(userId);

  await deleteDirectRelationships(userId);

  const connections = await BankConnection.findAll({ where: { userId }, paranoid: false });
  await Bluebird.map(connections, connection => deleteBankConnection(connection));

  await UserHelper.deleteAdminLoginOverride(user.phoneNumber);

  await PasswordHistory.destroy({ where: { userId }, force: true });

  await user.destroy({ force: true });
}

export async function deleteUser(phoneNumber: string) {
  const user = await User.findOne({ where: { phoneNumber }, paranoid: false });

  if (!user) {
    logger.info(`No user found with number ${phoneNumber}`);
    return;
  }

  await deleteDataForUser(user);
}
