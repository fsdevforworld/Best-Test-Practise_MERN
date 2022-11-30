import {
  InvalidParametersError,
  InvalidVerificationError,
  NotFoundError,
} from '@dave-inc/error-types';
import { Request, Response } from 'express';
import {
  cancel,
  createMobileTransaction,
  queryCard,
  shouldCreateMobileTransaction,
  TabapayCardQueryOptions,
  TabapayQueryCardResponse,
} from '../../lib/tabapay';
import { PaymentMethodType, TabapayAccountParam } from '@dave-inc/loomis-client';
import logger from '../../lib/logger';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { ExternalMobilePayment } from '../../typings';
import { PaymentMethod, MobilePayID, sequelize } from '../../models';
import { dogstatsd } from '../../lib/datadog-statsd';

const noAvsCheckList = [
  PaymentMethodType.DEBIT_CARD,
  PaymentMethodType.APPLE_PAY,
  PaymentMethodType.GOOGLE_PAY,
];

async function avsQuery(
  avsQueryOptions: TabapayCardQueryOptions,
  fundingType: PaymentMethodType,
  referenceId: string,
  daveUserId: string,
): Promise<{ shouldProceed: boolean; queryResponse: TabapayQueryCardResponse }> {
  let shouldProceed = false;
  let queryResponse;
  try {
    queryResponse = await queryCard(avsQueryOptions);
    shouldProceed = shouldCreateMobileTransaction(queryResponse);
  } catch (error) {
    logger.error(`Failed Tabapay card query for user ${daveUserId}`, { error });
    throw new InvalidVerificationError(
      `AVS card query request failed for user ${daveUserId}: ${error.message}`,
      {
        data: { fundingType, referenceId, daveUserId },
      },
    );
  }
  return { shouldProceed, queryResponse };
}

async function findOrCreateMobilePayID(
  accountNumber: string | number,
  userId: number,
): Promise<MobilePayID> {
  return sequelize.transaction(async transaction => {
    const hashedAccountID = MobilePayID.hashAccountID(accountNumber);
    const mobilePayId = await MobilePayID.findOne({
      attributes: ['id', 'userId'],
      where: { mobilePayID: hashedAccountID },
      transaction,
    });

    if (mobilePayId !== null && mobilePayId !== undefined) {
      return mobilePayId;
    }

    return MobilePayID.create(
      {
        mobilePayID: hashedAccountID,
        userId,
      },
      { transaction },
    );
  });
}

async function duplicateMobilePayCheck(accountNumber: string | number | undefined, userId: number) {
  if (accountNumber === undefined) {
    // This should never be the case
    logger.warn('Missing accountNumber param in ApplePay mobile payment');
    dogstatsd.increment('mobile_payment.duplicate_card_check.missing_account_number');
    return;
  }

  const mobilePayID = await findOrCreateMobilePayID(accountNumber, userId);
  if (mobilePayID.userId !== userId) {
    dogstatsd.increment('mobile_payment.duplicate_card_check.failure');
    throw new InvalidVerificationError(`Failed mobile-pay duplicate card check`, {
      data: { userId, mobilePayId: mobilePayID.id },
    });
  }

  dogstatsd.increment('mobile_payment.duplicate_card_check.success');
}

export default async function createMobilePayment(req: Request, res: Response) {
  const { referenceId, amount, fundingType, payload, owner, feeIncluded, daveUserId } = req.body;

  if (amount <= 0) {
    throw new InvalidParametersError('Amount must be greater than 0');
  }
  let sourceAccount: TabapayAccountParam;
  let sourceAccountID: string;
  let avsQueryOptions: TabapayCardQueryOptions;

  if (fundingType === PaymentMethodType.APPLE_PAY) {
    // We only check ApplePay at the moment
    // https://demoforthedaves.atlassian.net/browse/FPT-841
    await duplicateMobilePayCheck(payload?.mobilePay?.accountNumber, daveUserId);
  }

  switch (fundingType) {
    case PaymentMethodType.APPLE_PAY:
    case PaymentMethodType.GOOGLE_PAY:
      sourceAccount = {
        owner,
        card: payload,
      };
      avsQueryOptions = {
        amount: amount.toFixed(2),
        ...sourceAccount,
      } as TabapayCardQueryOptions;
      break;

    case PaymentMethodType.DEBIT_CARD:
      sourceAccountID = await getTabapayPaymentId(payload.paymentMethodId, daveUserId);
      avsQueryOptions = {
        owner,
        amount: amount.toFixed(2),
        account: { accountID: sourceAccountID },
      };
      break;

    default:
      throw new InvalidParametersError('Funding type not supported');
  }

  const { shouldProceed, queryResponse } = await avsQuery(
    avsQueryOptions,
    fundingType,
    referenceId,
    daveUserId,
  );

  if (!shouldProceed) {
    logger.error('Failed tabapay card query falied with invalid AVS', { response: queryResponse });
    throw new InvalidVerificationError(`User ${daveUserId} failed AVS check`, {
      data: { fundingType, referenceId, daveUserId },
    });
  }

  let mobileTransactionResponse: ExternalMobilePayment;
  try {
    mobileTransactionResponse = await createMobileTransaction({
      referenceId,
      sourceAccount,
      amount,
      feeIncluded,
      sourceAccountID,
    });

    // Apple/Google Pay and Debit card funding don't require AVS checks
    const isAVSMatch = noAvsCheckList.includes(fundingType)
      ? true
      : mobileTransactionResponse.isAVSMatch;

    if (mobileTransactionResponse.status !== ExternalTransactionStatus.Completed || isAVSMatch) {
      return res.json({
        referenceId,
        ...mobileTransactionResponse,
        isAVSMatch,
      });
    }
  } catch (error) {
    logger.error('Failed to create mobile transaction', { error });
    return res.json({
      referenceId,
      status: ExternalTransactionStatus.Canceled,
      error: error.message,
      errorCode: error.customCode,
    });
  }
  try {
    await cancel(mobileTransactionResponse.transactionId, true);
    return res.json({
      referenceId,
      ...mobileTransactionResponse,
      status: ExternalTransactionStatus.Canceled,
      error: 'Incorrect AVS',
    });
  } catch (error) {
    logger.error('Failed to reverse the transaction', { error });
    return res.status(500).json({
      referenceId,
      ...mobileTransactionResponse,
      status: ExternalTransactionStatus.Unknown,
      error: error.message,
    });
  }
}

async function getTabapayPaymentId(paymentMethodId: string, daveUserId: number) {
  const paymentMethodRow = await PaymentMethod.findByPk(paymentMethodId);
  if (!paymentMethodRow || !paymentMethodRow.tabapayId) {
    throw new NotFoundError('Missing provided payment method');
  }
  if (paymentMethodRow.userId !== daveUserId) {
    throw new InvalidParametersError('Invalid payment method');
  }
  return paymentMethodRow.tabapayId;
}
