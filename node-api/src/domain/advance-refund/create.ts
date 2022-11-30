import { PaymentMethod } from '@dave-inc/loomis-client';
import {
  BankAccount,
  Reimbursement,
  sequelize,
  AdvanceRefundLineItem,
  AdvanceRefund,
  Advance,
} from '../../models';
import { generateRandomHexString } from '../../lib/utils';
import { reasons } from '../../models/advance-refund-line-item';
import validateLineItems from './validate-line-items';

export interface IAdvanceRefundRequestLineItem {
  reason: typeof reasons[number];
  amount: number;
}

async function createAdvanceRefund(params: {
  userId: number;
  destination: PaymentMethod | BankAccount;
  advance: Advance;
  lineItems: IAdvanceRefundRequestLineItem[];
  dashboardActionLogId?: number;
}) {
  const { userId, destination, advance, lineItems, dashboardActionLogId } = params;

  await validateLineItems(lineItems, advance);

  const amount = lineItems.reduce((sum, lineItem) => sum + lineItem.amount, 0);

  const referenceId = generateRandomHexString(15);

  return sequelize.transaction(async transaction => {
    const reimbursement = await Reimbursement.create(
      {
        userId,
        amount,
        referenceId,
        payableId: destination.id,
        payableType: destination instanceof BankAccount ? 'BANK_ACCOUNT' : 'PAYMENT_METHOD',
        advanceId: advance.id,
        dashboardActionLogId,
      },
      { transaction },
    );

    const advanceRefund = await AdvanceRefund.create(
      {
        advanceId: advance.id,
        reimbursementId: reimbursement.id,
      },
      { transaction },
    );

    const lineItemsToCreate = lineItems.map(lineItem => ({
      advanceRefundId: advanceRefund.id,
      reason: lineItem.reason,
      amount: lineItem.amount,
      adjustOutstanding: lineItem.reason === 'overpayment',
    }));

    const advanceRefundLineItems = await AdvanceRefundLineItem.bulkCreate(lineItemsToCreate, {
      transaction,
    });

    return { reimbursement, advanceRefund, advanceRefundLineItems };
  });
}

export default createAdvanceRefund;
