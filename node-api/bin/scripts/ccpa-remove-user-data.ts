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
  AdvanceRuleLog,
  AdvancePaybackDatePrediction,
  Alert,
  AuditLog,
  BankConnection,
  BankConnectionTransition,
  BankTransaction,
  CampaignInfo,
  DaveBankingCallSession,
  DeleteRequest,
  EmailVerification,
  RewardsLedger,
  EmpyrEvent,
  ExpectedTransaction,
  FraudAlert,
  MembershipPause,
  OnboardingStep,
  PhoneNumberChangeRequest,
  RecurringTransaction,
  RedeemedSubscriptionBillingPromotion,
  SideHustleApplication,
  SubscriptionBilling,
  SubscriptionCollectionAttempt,
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
} from '../../src/models';
import { deleteMxUser } from '../../src/helper/user';
import * as PaymentMethodDomain from '../../src/domain/payment-method';
import { Model, ModelCtor, Op } from 'sequelize';
import * as Bluebird from 'bluebird';
import * as Synapse from '../../src/domain/synapsepay';
import { sequelize } from '../../src/models';
import logger from '../../src/lib/logger';
import { removeBankAccountRelationships } from '../../src/services/loomis-api/domain/delete-bank-account';
import { moment } from '@dave-inc/time-lib';
import braze from '../../src/lib/braze';
import amplitude from '../../src/lib/amplitude';
import { deleteUser as deleteAppsflyerUser } from '../../src/lib/appsflyer';
import { runTaskGracefully } from '../../src/lib/utils';
import loomisClient, { PaymentMethod } from '@dave-inc/loomis-client';
import { generateBankingDataSource } from '../../src/domain/banking-data-source';

export async function ccpaDeleteRequest(deleterUserId: number, userId: number) {
  const author = await User.findByPk(deleterUserId);
  if (!author) {
    throw new Error(`No user found with id ${deleterUserId}`);
  }

  const user = await User.findByPk(userId, { paranoid: false });

  if (!user) {
    throw new Error(`No user found with id ${userId}`);
  }

  const connections = await BankConnection.findAll({ where: { userId }, paranoid: false });

  const daveBankingUser = connections.some(c => c.isDaveBanking());

  await Bluebird.map(connections, connection => deleteBankConnection(connection));

  await Promise.all([
    Synapse.deleteSynapsePayUser(user),
    user.mxUserId ? deleteMxUser(user) : null,
    DeleteRequest.create({ userId, reason: 'CCPA_REQUEST' }),
    AdminComment.create({
      userId,
      authorId: author.id,
      message: 'User deleted via a ccpa request',
    }),
  ]);

  await deleteNonUserIdTables(userId);

  await deleteUserIdTables(userId);

  await nullifyUnneededFields(userId, daveBankingUser);

  await amplitude.deleteUser(userId, deleterUserId);

  await braze.deleteUser(userId);

  await deleteAppsflyerUser(userId);

  if (!user.deleted || user.deleted.isAfter(moment())) {
    const query = `
        UPDATE user
        SET deleted      = current_timestamp,
            phone_number = concat(phone_number, '-deleted-', unix_timestamp())
        WHERE id = :userId
    `;

    await sequelize.query(query, { replacements: { userId } });
  }
}

async function nullifyUnneededFields(userId: number, isBankingUser: boolean) {
  await sequelize.query(
    `
  UPDATE bank_account
  SET main_paycheck_recurring_transaction_id = NULL,
      default_payment_method_id = null,
      external_id = null,
      synapse_node_id = null,
      display_name = 'DELETED',
      last_four = null,
      current = null,
      available = null,
      pre_approval_waitlist = null,
      risepay_id = null,
      micro_deposit = null,
      micro_deposit_created = null,
      account_number = null
  WHERE user_id = :userId`,
    { replacements: { userId } },
  );

  const clearPII = `email = null,
  first_name = null,
  last_name = null,
  address_line1 = null,
  address_line2 = null,
  city = null,
  zip_code = null,
  ssn = null,`;

  await sequelize.query(
    `
    UPDATE user
    SET ${!isBankingUser ? clearPII : ''}
        settings = '{}',
        pin = null,
        gender = null,
        profile_image = null,
        fcm_token = null
    WHERE id = :userId
  `,
    { replacements: { userId } },
  );

  let paymentMethods: PaymentMethod[];
  const loomisResponse = await loomisClient.getPaymentMethods(userId);
  if ('error' in loomisResponse) {
    // Not Found errors will be returned as a null value for this endpoint, so any error is either
    // unexpected or invalid parameters, like a poorly formed userId. In either case this script
    // should fail.
    const { error } = loomisResponse;
    logger.error(`Loomis Client - getPaymentMethods failed for user ${userId}`, {
      error,
      logSource: __filename,
    });
    throw error;
  } else {
    paymentMethods = loomisResponse.data;
  }

  await Bluebird.map(paymentMethods, method => {
    return PaymentMethodDomain.softDeletePaymentMethod(method);
  });
}

async function deleteBankConnection(connection: BankConnection) {
  try {
    const bankingDataSource = await generateBankingDataSource(connection);
    await bankingDataSource.deleteNexus();
  } catch (err) {
    logger.error('Error deleting bank connection source', { err });
  }

  await removeBankAccountRelationships(connection);
  await connection.update({ externalId: null });
  await BankConnectionTransition.destroy({
    where: {
      [Op.or]: [{ fromBankConnectionId: connection.id }, { toBankConnectionId: connection.id }],
    },
  });
  await connection.softDelete();
}

export const userIdClasses: Array<ModelCtor<Model<{ userId: number }>>> = [
  ABTestingEvent,
  AdminComment,
  AdminPaycheckOverride,
  AdvanceExperimentLog,
  Alert,
  AuditLog,
  BankTransaction,
  EmailVerification,
  RewardsLedger,
  EmpyrEvent,
  ExpectedTransaction,
  FraudAlert,
  MembershipPause,
  OnboardingStep,
  PhoneNumberChangeRequest,
  UserNotification,
  RecurringTransaction,
  SideHustleApplication,
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
  UserRole,
];

async function deleteUserIdTables(userId: number) {
  await Bluebird.each(userIdClasses, uc => {
    return uc.destroy({ where: { userId }, force: true });
  });
}

async function deleteNonUserIdTables(userId: number) {
  const approvals = await AdvanceApproval.findAll({ where: { userId } });
  await Bluebird.each(approvals, async approval => {
    await AdvanceNodeLog.destroy({ where: { advanceApprovalId: approval.id } });
    await AdvanceRuleLog.deleteByAdvanceApprovalId(approval.id);
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

  const advances = await Advance.findAll({ where: { userId } });
  await Bluebird.each(advances, async advance => {
    await AdvanceCollectionAttempt.destroy({ where: { advanceId: advance.id } });
    await AdvanceCollectionSchedule.destroy({ where: { advanceId: advance.id } });
  });

  const subscriptions = await SubscriptionBilling.findAll({ where: { userId } });
  await Bluebird.each(subscriptions, async sub => {
    await SubscriptionCollectionAttempt.destroy({ where: { subscriptionBillingId: sub.id } });
    await sub.update({ rewardsLedgerId: null });
  });
}

if (require.main === module) {
  if (process.argv.length < 4) {
    logger.error('This command requires 2 arguments, author user id and user id.');
    logger.error('E.G. ts-node ccpa-remove-user-data.ts 96832 45');
    process.exit(1);
  }
  const deleterUserId = parseInt(process.argv[2], 10);
  const userId = parseInt(process.argv[3], 10);
  if (!userId || isNaN(userId) || !deleterUserId || isNaN(deleterUserId)) {
    logger.error('User id and author user id must be valid integers.');
    process.exit(1);
  }

  runTaskGracefully(() => ccpaDeleteRequest(deleterUserId, userId));
}
