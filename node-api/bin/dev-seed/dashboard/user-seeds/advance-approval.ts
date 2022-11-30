import { DonationOrganizationCode, ExternalTransactionProcessor } from '@dave-inc/wire-typings';

import { User } from '../../../../src/models';
import { createUser } from '../../utils';
import factory from '../../../../test/factories';
import { deleteDataForUser } from '../../delete-user';
import { getEmail } from '../utils';
import { NodeNames } from '../../../../src/services/advance-approval/advance-approval-engine/common';
import * as Bluebird from 'bluebird';

const approvedEmail = 'advance-approval-approved@dave.com';
const failedEmail = 'advance-approval-failed@dave.com';

async function up(phoneNumberSeed: string) {
  const [approvedUser, failedUser] = await Promise.all([
    createUser({
      firstName: 'Dashboard',
      lastName: 'Advance Approval Success',
      email: getEmail(phoneNumberSeed, approvedEmail),
    }),
    await createUser({
      firstName: 'Dashboard',
      lastName: 'Advance Approval Failure',
      email: getEmail(phoneNumberSeed, failedEmail),
    }),
  ]);

  await Promise.all([make(approvedUser, true), make(failedUser, false)]);
}

const make = async (user: User, approved: boolean) => {
  const bankConnection = await factory.create('bank-connection', {
    userId: user.id,
    hasValidCredentials: true,
    hasTransactions: true,
  });

  const bankAccount = await factory.create('checking-account', {
    userId: user.id,
    institutionId: bankConnection.institutionId,
    bankConnectionId: bankConnection.id,
    current: 500,
    available: 500,
  });

  const [recurringTransaction] = await Promise.all([
    factory.create('recurring-transaction', {
      userId: user.id,
      bankAccountId: bankAccount.id,
    }),
    user.update({ defaultBankAccountId: bankAccount.id }),
  ]);

  const advanceApproval = await factory.create('big-money-advance-approval', {
    userId: user.id,
    bankAccountId: bankAccount.id,
    recurringTransactionId: recurringTransaction.id,
    approved,
  });

  await factory.create('advance-node-log', {
    name: NodeNames.EligibilityNode,
    success: true,
    successNodeName: NodeNames.PaydaySolvencyNode,
    advanceApprovalId: advanceApproval.id,
  });

  await factory.create('advance-rule-log', {
    ruleName: 'bankDisconnected',
    nodeName: NodeNames.EligibilityNode,
    success: true,
    advanceApprovalId: advanceApproval.id,
  });

  await factory.create('advance-rule-log', {
    ruleName: 'hasInitialPull',
    nodeName: NodeNames.EligibilityNode,
    success: true,
    advanceApprovalId: advanceApproval.id,
  });

  await factory.create('advance-node-log', {
    name: NodeNames.PaydaySolvencyNode,
    success: approved,
    advanceApprovalId: advanceApproval.id,
  });

  await factory.create('advance-rule-log', {
    ruleName: 'historicalPaydaySolvency',
    nodeName: NodeNames.PaydaySolvencyNode,
    success: approved,
    error: approved ? null : 'bad historcial solvency',
    data: approved
      ? null
      : {
          isEligibleForExperiment: false,
        },
    advanceApprovalId: advanceApproval.id,
  });

  const advance = await factory.create('advance', {
    chosenAdvanceApprovalId: advanceApproval.id,
    bankAccountId: bankAccount.id,
    disbursementProcessor: ExternalTransactionProcessor.Synapsepay,
    userId: user.id,
    amount: 50,
    outstanding: 0,
    fee: 5,
  });

  await factory.create('advance-tip', {
    advanceId: advance.id,
    donationOrganization: DonationOrganizationCode.TREES,
    amount: 5,
    percent: 10,
  });
};

async function down(phoneNumberSeed: string) {
  const user = await User.findAll({
    where: {
      email: [getEmail(phoneNumberSeed, approvedEmail), getEmail(phoneNumberSeed, failedEmail)],
    },
  });

  await Bluebird.each(user, deleteDataForUser);
}

export { up, down };
