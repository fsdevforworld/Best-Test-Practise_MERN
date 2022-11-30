import { PaymentMethod } from '@dave-inc/loomis-client';
import { BankAccount, Reimbursement, sequelize, DashboardActionLog } from '../../../../models';
import { generateRandomHexString } from '../../../../lib/utils';

async function createSubscriptionReimbursement(params: {
  userId: number;
  destination: PaymentMethod | BankAccount;
  amount: number;
  subscriptionPaymentId: number;
  actionLogParams: {
    dashboardActionReasonId: number;
    internalUserId: number;
    zendeskTicketUrl: string;
    note: string;
  };
}) {
  const { userId, destination, amount, subscriptionPaymentId, actionLogParams } = params;

  const referenceId = generateRandomHexString(15);
  let reimbursement: Reimbursement;
  let dashboardActionLog: DashboardActionLog;

  await sequelize.transaction(async transaction => {
    dashboardActionLog = await DashboardActionLog.create(actionLogParams, { transaction });

    reimbursement = await Reimbursement.create(
      {
        userId,
        amount,
        referenceId,
        payableId: destination.id,
        payableType: destination instanceof BankAccount ? 'BANK_ACCOUNT' : 'PAYMENT_METHOD',
        subscriptionPaymentId,
        dashboardActionLogId: dashboardActionLog.id,
      },
      { transaction },
    );
  });

  return { reimbursement, dashboardActionLog };
}

export default createSubscriptionReimbursement;
