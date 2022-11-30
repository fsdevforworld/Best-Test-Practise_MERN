import loomisClient, { PaymentMethod } from '@dave-inc/loomis-client';
import { AuditLog, BankAccount, Reimbursement, User, InternalUser } from '../../models';
import { generateRandomHexString } from '../../lib/utils';
import PaymentProvider from '../../lib/payment-provider';
import { get } from 'lodash';
import logger from '../../lib/logger';
import { parseLoomisGetPaymentMethod } from '../../services/loomis-api/helper';
import { InvalidParametersError } from '../../lib/error';

export default async function createReimbursement(params: {
  user: User;
  destination: PaymentMethod | BankAccount;
  amount: number;
  reimburser: InternalUser;
  reason?: string;
  advanceId?: number;
  subscriptionPaymentId?: number;
  zendeskTicketId?: string;
  actionLogId?: number;
  extra?: {
    note?: string;
    lineItems?: {
      [key: string]: {
        amount: number;
        reason: string;
      };
    };
  };
}) {
  const {
    user,
    destination,
    amount,
    reason,
    reimburser,
    advanceId,
    subscriptionPaymentId,
    zendeskTicketId,
    extra,
  } = params;

  const referenceId = generateRandomHexString(15);

  if (!destination) {
    throw new InvalidParametersError('No destination provided');
  }

  const [reimbursement, ...disbursementPlan] = await Promise.all([
    Reimbursement.create({
      userId: user.id,
      reimburserId: reimburser.id,
      amount,
      reason,
      referenceId,
      payableId: destination.id,
      payableType: isBankAccount(destination) ? 'BANK_ACCOUNT' : 'PAYMENT_METHOD',
      advanceId,
      subscriptionPaymentId,
      zendeskTicketId,
      extra,
    }),
    user,
    isBankAccount(destination) ? destination : getBankAccount(destination.bankAccountId),
    isBankAccount(destination) ? getPaymentMethod(destination.defaultPaymentMethodId) : destination,
    referenceId,
    amount,
    isBankAccount(destination) ? 'standard' : 'express',
  ]);

  let transactionResult;
  try {
    transactionResult = await PaymentProvider.disburse(...disbursementPlan);
  } catch (ex) {
    logger.error('Failed to send reimbursement', {
      reimbursement,
      error: ex,
    });
    transactionResult = {
      status: 'FAILED',
      id: get(ex, 'data.transactionID'), // We can sometimes get this from failed Tabapay transactions
      processor: ex.gateway,
      data: ex?.data,
    };
  }

  await reimbursement.update({
    status: transactionResult.status,
    externalId: transactionResult.id,
    externalProcessor: transactionResult.processor,
    extra: {
      ...extra,
      transactionResult,
    },
  });

  await AuditLog.create({
    userId: user.id,
    type: 'REIMBURSEMENT_CREATE',
    message: 'Created reimbursement',
    successful: transactionResult.status === 'COMPLETED' || transactionResult.status === 'PENDING',
    eventUuid: reimbursement.id,
    extra: {
      transactionResult,
      reimbursement,
    },
  });

  return reimbursement;
}

function isBankAccount(destination: BankAccount | PaymentMethod): destination is BankAccount {
  return destination instanceof BankAccount;
}

function getBankAccount(bankAccountId: number): Promise<BankAccount> {
  return BankAccount.findOne({
    where: {
      id: bankAccountId,
    },
    paranoid: false,
  });
}

async function getPaymentMethod(id: number): Promise<PaymentMethod> {
  const loomisResponse = await loomisClient.getPaymentMethod({ id, includeSoftDeleted: true });
  return parseLoomisGetPaymentMethod(loomisResponse, __filename);
}
