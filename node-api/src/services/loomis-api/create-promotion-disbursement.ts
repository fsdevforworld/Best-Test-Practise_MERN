import { Request, Response } from 'express';
import {
  PaymentProviderTransactionType,
  getPaymentGateway as getGateway,
} from '@dave-inc/loomis-client';

import { generateRandomHexString } from '../../lib/utils';
import logger from '../../lib/logger';
import {
  PaymentProviderTransaction,
  PaymentProviderTransactionStatus,
  PaymentGateway,
  PaymentProcessor,
} from '../../typings';
import { BankAccount, BankConnection, User, AuditLog, EmailVerification } from '../../models';
import {
  InvalidParametersError,
  NotFoundError,
  PaymentError,
  NotSupportedError,
} from '../../lib/error';
import { updateSynapseNodeId } from '../../domain/synapsepay/nodeupdate';
import { upsertSynapsePayUser } from '../../domain/synapsepay';
import { InvalidParametersMessageKey } from '../../translations';

const DISBURSEMENT_UPPER_BOUND_DOLLARS = 100;

export async function createPromotionDisbursement(req: Request, res: Response): Promise<Response> {
  const { amountInCents, bankConnectionExternalId } = req.body;

  if (isNaN(amountInCents)) {
    throw new InvalidParametersError(`Payment amount must a number: Got ${amountInCents}`);
  }
  const amount = amountInCents / 100;
  if (amount <= 0 || amount > DISBURSEMENT_UPPER_BOUND_DOLLARS) {
    throw new InvalidParametersError(
      `Payment dollar amount must be between 0 and ${DISBURSEMENT_UPPER_BOUND_DOLLARS}: Got ${amount}`,
    );
  }

  if (!bankConnectionExternalId) {
    throw new InvalidParametersError(
      InvalidParametersMessageKey.PaymentMethodOrBankAccountRequired,
    );
  }

  const bankConnection = await BankConnection.findOne({
    include: [{ model: User }],
    where: {
      externalId: bankConnectionExternalId,
    },
  });
  const bankAccounts = await bankConnection.getBankAccounts();

  let bankAccount;
  for (const ba of bankAccounts) {
    if (!ba.isSupported()) {
      continue;
    }
    if (ba.id === bankConnection.primaryBankAccountId) {
      bankAccount = ba;
      break;
    }
    if (!bankAccount) {
      bankAccount = ba;
    }
  }

  if (!bankAccount) {
    throw new NotFoundError('Unable to find bank account');
  }
  const isDaveBanking = await bankAccount.isDaveBanking();
  if (isDaveBanking) {
    throw new NotSupportedError(
      'This promotion disbursement does not support Dave Banking accounts',
    );
  }
  const user = bankConnection.user;

  const disbursement = await createDisbursement(user, bankAccount, amount);
  if (disbursement.status === PaymentProviderTransactionStatus.InvalidRequest) {
    throw new PaymentError('Invalid transaction request');
  }
  return res.send(disbursement);
}

async function createDisbursement(
  user: User,
  bankAccount: BankAccount,
  amount: number,
): Promise<PaymentProviderTransaction> {
  if (!user.synapsepayId) {
    const latestVerification = await EmailVerification.latestForUser(user.id);

    // create a synapse user node for promotion disbursement. We are not going to be doing KYC right now.
    const fields = {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email || latestVerification.email,
    };
    try {
      await upsertSynapsePayUser(user, '', fields);
    } catch (err) {
      throw new NotSupportedError(
        `Unable to get create synapsePayUser for user: ${user.id}: ${err.message}`,
      );
    }
    await user.reload();
    if (!user?.synapsepayId) {
      throw new NotFoundError(
        `Unable to retrieve new record with updated synapsepayId for userId: ${user.id}`,
      );
    }
  }

  if (!bankAccount.synapseNodeId) {
    try {
      await updateSynapseNodeId(bankAccount, user, '');
    } catch (err) {
      throw new NotSupportedError(
        `Unable to get synapseNodeId for bankAccountId: ${bankAccount.id}: ${err.message}`,
      );
    }
  }
  const referenceId = generateRandomHexString(15);
  let transactionResult: PaymentProviderTransaction;
  try {
    transactionResult = await synapseDisburse(bankAccount, referenceId, amount);
  } catch (err) {
    logger.error('Failed to send disbursement', {
      err,
    });
    transactionResult = {
      status: PaymentProviderTransactionStatus.Failed,
      externalId: err?.data?.transactionID,
      processor: PaymentProcessor.Synapsepay,
      referenceId,
      gateway: PaymentGateway.Synapsepay,
      reversalStatus: null,
    };
    await AuditLog.create({
      userId: user.id,
      type: 'PROMOTION_DISBURSEMENT_CREATE',
      message: 'Failed to create promotion disbursement',
      successful: false,
      eventUuid: referenceId,
      extra: {
        transactionResult,
      },
    });
    throw err;
  }
  await AuditLog.create({
    userId: user.id,
    type: 'PROMOTION_DISBURSEMENT_CREATE',
    message: 'Created promotion disbursement',
    successful: transactionResult.status === 'COMPLETED' || transactionResult.status === 'PENDING',
    eventUuid: referenceId,
    extra: {
      transactionResult,
    },
  });

  return transactionResult;
}

async function synapseDisburse(
  bankAccount: BankAccount,
  referenceId: string,
  amount: number,
): Promise<PaymentProviderTransaction> {
  const gateway = getGateway(PaymentGateway.Synapsepay);
  const externalPayment = await gateway.createTransaction({
    sourceId: bankAccount.synapseNodeId,
    referenceId,
    amount,
    type: PaymentProviderTransactionType.PromotionDisbursement,
  });

  return externalPayment;
}
