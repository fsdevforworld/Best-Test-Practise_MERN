import { BankAccount, Reimbursement } from '../../../src/models';
import PaymentProvider from '../../lib/payment-provider';
import logger from '../../lib/logger';
import { get } from 'lodash';
import loomisClient, { PaymentMethod } from '@dave-inc/loomis-client';
import { parseLoomisGetPaymentMethod } from '../../../src/services/loomis-api/helper';

/**
 * This duplicates most of the code found in ./create-reimbursement.ts. It does not create the reimbursement.
 * @param reimbursement
 */
async function processReimbursement(reimbursement: Reimbursement) {
  let bankAccount: BankAccount;
  let paymentMethod: PaymentMethod;
  const user = reimbursement.user || (await reimbursement.getUser());

  const isBankAccount = reimbursement.payableType === 'BANK_ACCOUNT';

  if (isBankAccount) {
    bankAccount = await getBankAccount(reimbursement.payableId);
    paymentMethod = await getPaymentMethod(bankAccount.defaultPaymentMethodId);
  } else {
    paymentMethod = await getPaymentMethod(reimbursement.payableId);
    bankAccount = await getBankAccount(paymentMethod.bankAccountId);
  }

  let transactionResult;
  try {
    transactionResult = await PaymentProvider.disburse(
      user,
      bankAccount,
      paymentMethod,
      reimbursement.referenceId,
      reimbursement.amount,
      isBankAccount ? 'standard' : 'express',
    );
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
      ...reimbursement.extra,
      transactionResult,
    },
  });

  return reimbursement;
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

export default processReimbursement;
