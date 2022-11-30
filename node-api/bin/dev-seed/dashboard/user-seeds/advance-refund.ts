import { DonationOrganizationCode, ExternalTransactionProcessor } from '@dave-inc/wire-typings';

import { DashboardActionLog, Reimbursement, User } from '../../../../src/models';
import { ActionCode } from '../../../../src/services/internal-dashboard-api/domain/action-log';
import { createUser } from '../../utils';
import factory from '../../../../test/factories';
import { deleteDataForUser } from '../../delete-user';
import { createActionLog, getEmail } from '../utils';

const email = 'advance-refund@dave.com';

async function up(phoneNumberSeed: string) {
  const user = await createUser({
    firstName: 'Advance Refund',
    lastName: 'Seed',
    email: getEmail(phoneNumberSeed, email),
  });

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

  await user.update({ defaultBankAccountId: bankAccount.id });

  const advance = await factory.create('advance', {
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

  await factory.create('payment', {
    advanceId: advance.id,
    bankAccountId: bankAccount.id,
    userId: user.id,
    amount: 110,
  });

  const actionLog = await createActionLog({
    code: ActionCode.CreateAdvanceRefund,
    reason: 'Refund',
  });

  const reimbursement = await factory.create('reimbursement', {
    userId: user.id,
    advanceId: advance.id,
    amount: 60,
    status: 'COMPLETED',
    dashboardActionLogId: actionLog.id,
    payableId: bankAccount.id,
    payableType: 'BANK_ACCOUNT',
  });

  const advanceRefund = await factory.create('advance-refund', {
    advanceId: advance.id,
    reimbursementId: reimbursement.id,
  });

  const lineItems = [
    {
      reason: 'tip',
      amount: 5,
    },
    {
      reason: 'fee',
      amount: 5,
    },
    {
      reason: 'overpayment',
      amount: 50,
    },
  ];

  await Promise.all(
    lineItems.map(lineItem => {
      factory.create('advance-refund-line-item', {
        advanceRefundId: advanceRefund.id,
        reason: lineItem.reason,
        amount: lineItem.amount,
        adjustOutstanding: lineItem.reason === 'overpayment',
      });
    }),
  );

  await factory.create('dashboard-advance-modification', {
    advanceId: advance.id,
    dashboardActionLogId: actionLog.id,
    modification: {
      outstanding: {
        previousValue: -50,
        currentValue: 0,
      },
    },
  });
}

async function down(phoneNumberSeed: string) {
  const user = await User.findOne({
    where: {
      email: getEmail(phoneNumberSeed, email),
    },
  });

  if (user) {
    const reimbursement = await Reimbursement.findOne({
      where: { userId: user.id },
      include: [DashboardActionLog],
    });
    const dashboardActionLog = reimbursement?.dashboardActionLog;
    await deleteDataForUser(user);

    if (dashboardActionLog) {
      await dashboardActionLog.destroy();
    }
  }
}

export { up, down };
