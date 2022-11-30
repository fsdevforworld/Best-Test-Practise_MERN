import { Response } from 'express';
import loomisClient, { PaymentMethod } from '@dave-inc/loomis-client';
import { BankAccount, User } from '../../../models';
import { InvalidParametersError, NotFoundError } from '../../../lib/error';
import { createReimbursement } from '../../../domain/reimbursement';
import { InvalidParametersMessageKey } from '../../../translations';
import { parseLoomisGetPaymentMethod } from '../../../services/loomis-api/helper';
import { IDashboardApiRequest } from '../../../typings';

type AdminReimburseRequestBody = {
  amount: number;
  userId: number;
  reason: string;
  paymentMethodId: number;
  bankAccountId: number;
};

async function reimburse(
  req: IDashboardApiRequest<AdminReimburseRequestBody>,
  res: Response,
): Promise<Response> {
  const { amount, userId, reason, paymentMethodId, bankAccountId } = req.body;

  if (isNaN(amount) || amount <= 0 || amount > 200) {
    throw new InvalidParametersError('Payment amount must be between 0 and 200');
  }

  let destination: PaymentMethod | BankAccount;
  let user: User;
  if (paymentMethodId) {
    const loomisResponse = await loomisClient.getPaymentMethod({
      id: paymentMethodId,
      userId,
      includeSoftDeleted: true,
    });
    destination = parseLoomisGetPaymentMethod(loomisResponse, __filename);

    if (!destination) {
      throw new NotFoundError('Unable to find payment method');
    }

    user = await User.findOne({
      where: {
        id: userId,
      },
      paranoid: false,
    });
  } else if (bankAccountId) {
    destination = await BankAccount.findOne({
      where: {
        id: bankAccountId,
        userId,
      },
      paranoid: false,
      include: [{ model: User, paranoid: false }],
    });

    if (!destination) {
      throw new NotFoundError('Unable to find bank account');
    }
    user = destination.user;
  } else {
    throw new InvalidParametersError(
      InvalidParametersMessageKey.PaymentMethodOrBankAccountRequired,
    );
  }

  const reimbursement = await createReimbursement({
    user,
    destination,
    amount,
    reimburser: req.internalUser,
    reason,
  });

  if (reimbursement.status === 'FAILED') {
    res.status(424);
  }

  return res.send(reimbursement);
}

export default {
  reimburse,
};
