import * as Bluebird from 'bluebird';
import { moment } from '@dave-inc/time-lib';
import {
  AdminComment,
  AdminPaycheckOverride,
  Advance,
  AdvanceApproval,
  AdvanceExperiment,
  BankAccount,
  BankConnection,
  EmailVerification,
  FraudAlert,
  MembershipPause,
  Payment,
  PaymentReversal,
  PhoneNumberChangeRequest,
  Reimbursement,
  SynapsepayDocument,
  TransactionSettlement,
  User,
  UserSession,
} from '../../../../models';
import * as RecurringTransactionDomain from '../../../../domain/recurring-transaction';
import { NotFoundError } from '../../../../lib/error';
import { NotFoundMessageKey } from '../../../../translations';
import formatAdvanceResponse from './format-advance-response';
import organizeConnections from './organize-connections';
import { getUserLocale } from '../../../../domain/user-setting/locale';
import { fn, col } from 'sequelize';
import UserHelper from '../../../../helper/user';
import loomisClient, { PaymentMethod } from '@dave-inc/loomis-client';

async function getAdvances(userId: number) {
  const advanceData = await Advance.findAll({
    where: { userId },
    paranoid: false,
    include: [
      {
        model: Payment,
        paranoid: false,
        include: [PaymentReversal],
      },
      { model: AdvanceApproval, include: [AdvanceExperiment] },
      {
        model: TransactionSettlement,
      },
      Reimbursement,
    ],
  });

  return Bluebird.map(advanceData, formatAdvanceResponse);
}

async function getPaymentMethods(
  userId: number,
  options: { includeSoftDeleted?: boolean },
): Promise<PaymentMethod[]> {
  const loomisResponse = await loomisClient.getPaymentMethods(userId, options);
  if ('error' in loomisResponse) {
    throw new Error(`Loomis gave an error in getPaymentMethods ${loomisResponse.error.message}`);
  }
  return loomisResponse.data;
}

export default async function fetchUserDetails(userId: number) {
  const start = moment();
  const stop = moment().add(30, 'day');
  const forUserIncludingSoftDeleted = {
    where: { userId },
    paranoid: false,
  };

  const {
    user,
    advances,
    methods,
    conns,
    accounts,
    comments,
    overrides,
    predictions,
    phoneNumberChangeRequests,
    fraudAlerts,
    reimbursements,
    emailVerification,
    membershipPauses,
    bankAccounts,
    bankConnections,
    cards,
    synapsepayDocuments,
    devices,
    locale,
  } = await Bluebird.props({
    user: User.findByPk(userId, {
      paranoid: false,
    }),
    advances: getAdvances(userId),
    methods: getPaymentMethods(userId, {}),
    conns: BankConnection.getByUserIdWithInstitution(userId),
    accounts: BankAccount.findAll({ where: { userId } }),
    comments: AdminComment.findAll({ where: { userId } }),
    overrides: AdminPaycheckOverride.findAll({ where: { userId } }),
    predictions: RecurringTransactionDomain.getExpectedByUser(userId, start, stop),
    phoneNumberChangeRequests: PhoneNumberChangeRequest.findAll({ where: { userId } }),
    fraudAlerts: FraudAlert.findAll({ where: { userId } }),
    reimbursements: Reimbursement.findAll({
      where: { userId, advanceId: null, subscriptionPaymentId: null },
    }),
    emailVerification: EmailVerification.latestForUser(userId),
    membershipPauses: MembershipPause.findAll({
      where: { userId },
    }),
    bankAccounts: BankAccount.findAll(forUserIncludingSoftDeleted),
    bankConnections: BankConnection.findAll(forUserIncludingSoftDeleted),
    cards: getPaymentMethods(userId, { includeSoftDeleted: true }),
    synapsepayDocuments: SynapsepayDocument.findAll(forUserIncludingSoftDeleted),
    devices: UserSession.findAll({
      attributes: [['device_id', 'id'], 'deviceType', [fn('min', col('created')), 'firstSeenAt']],
      where: { userId },
      group: ['device_id', 'device_type'],
      paranoid: false,
    }),
    locale: getUserLocale(userId),
  });

  if (!user) {
    throw new NotFoundError(NotFoundMessageKey.UserNotFound, { interpolations: { userId } });
  }

  const [membershipPause, synapsepayDocument, roles, coolOffStatus] = await Promise.all([
    user.getCurrentMembershipPause(),
    SynapsepayDocument.findOne({
      where: { userId, synapsepayUserId: user.synapsepayId },
    }),
    user.getRoleNames(),
    UserHelper.getCoolOffStatus(user.id),
  ]);

  return {
    user,
    comments,
    advances,
    phoneNumberChangeRequests,
    connections: organizeConnections(conns, accounts, methods, overrides, predictions),
    fraudAlerts,
    reimbursements,
    roles,
    emailVerification,
    coolOffStatus,
    membershipPause: membershipPause ? membershipPause.serialize() : null, // We plan to deprecate this when dashboard comes out of Beta.
    synapsepayDocument,
    membershipPauses,
    bankAccounts,
    bankConnections,
    cards,
    synapsepayDocuments,
    devices,
    locale: locale || 'en', // null implies English
  };
}
