/*
  Try the debit card, if it fails for any reason besides
  insufficient funds, try to ACH the bank account.
*/
import loomisClient, {
  PaymentMethod,
  TabapayAccountCardParam,
  TabapayAccountOwnerParam,
} from '@dave-inc/loomis-client';
import { Advance, AuditLog, BankAccount } from '../../models';
import { ChargeableMethod, ExternalPayment, ExternalPaymentCreator } from '../../typings';
import { createFallbackCharge } from '../../domain/collection/create-fallback-charge';
import {
  AdvanceDelivery,
  ExternalTransactionProcessor,
  ExternalTransactionStatus,
} from '@dave-inc/wire-typings';
import { PaymentError, PaymentProcessorError } from '../../lib/error';
import { dogstatsd } from '../../lib/datadog-statsd';
import * as BankAccountCharge from './charge-bank-account';
import * as DebitCardCharge from './charge-debit-card';
import { generateRandomHexString } from '../../lib/utils';
import * as Tabapay from '../../lib/tabapay';
import { parseLoomisGetPaymentMethod } from '../../services/loomis-api/helper';

export async function createDefaultCharge(
  advance: Advance,
  possiblePaymentMethod?: PaymentMethod,
): Promise<ExternalPaymentCreator> {
  const bankAccount = advance.bankAccount || (await advance.getBankAccount({ paranoid: false }));
  const paymentMethod =
    possiblePaymentMethod ||
    parseLoomisGetPaymentMethod(
      await loomisClient.getPaymentMethod({
        id: advance.paymentMethodId,
        includeSoftDeleted: true,
      }),
      __filename,
    );

  return createFallbackFromDebitCardToBankAccount(advance, bankAccount, paymentMethod);
}

export function createFallbackFromDebitCardToBankAccount(
  advance: Advance,
  bankAccount: BankAccount,
  paymentMethod?: PaymentMethod,
): ExternalPaymentCreator {
  if (!paymentMethod) {
    return BankAccountCharge.createBankAccountAdvanceCharge(bankAccount, advance);
  }

  return createFallbackCharge(
    DebitCardCharge.createDebitCardAdvanceCharge(paymentMethod, advance),
    BankAccountCharge.createBankAccountAdvanceCharge(bankAccount, advance),
    async ex => {
      let shouldCollect = false;

      const isInsufficientFundsError = DebitCardCharge.isInsufficientFundsError(ex);
      const isLinkedCard =
        advance.disbursementBankTransactionId != null &&
        advance.delivery === AdvanceDelivery.Express;
      const isUnknownPaymentProcessorError = DebitCardCharge.isUnknownPaymentProcessorError(ex);
      const isPaymentProcessingError = ex instanceof PaymentProcessorError;
      const isPaymentError = ex instanceof PaymentError;

      if (isInsufficientFundsError) {
        shouldCollect = !isLinkedCard;
      } else if (isPaymentError || (isPaymentProcessingError && !isUnknownPaymentProcessorError)) {
        shouldCollect = true;
      } else {
        dogstatsd.increment('advance_payment.create_fallback_charge.unknown_error');
        await AuditLog.create({
          userId: advance.userId,
          type: 'CREATE_FALLBACK_CHARGE_UNKNOWN_ERROR',
          message: ex.message,
          successful: false,
          extra: {
            ex,
            advance: {
              id: advance.id,
              outstanding: advance.outstanding,
            },
            variables: {
              isInsufficientFundsError,
              isLinkedCard,
              isUnknownPaymentProcessorError,
              isPaymentProcessingError,
            },
          },
        });
      }
      return shouldCollect;
    },
  );
}

export function createOneTimeCharge(
  advance: Advance,
  cardInfo: TabapayAccountCardParam,
  owner?: TabapayAccountOwnerParam,
): ExternalPaymentCreator {
  return async (amount: number) => {
    const user = await advance.getUser();

    if (!owner) {
      owner = {
        name: {
          first: user.firstName,
          last: user.lastName,
        },
      };
    }

    const accountInfo = { card: cardInfo, owner };

    const referenceNumber = generateRandomHexString(15);

    const externalResponse = await Tabapay.retrieve(referenceNumber, accountInfo, amount, false);

    const { status, id } = externalResponse;

    if (
      status !== ExternalTransactionStatus.Completed &&
      status !== ExternalTransactionStatus.Pending &&
      status !== ExternalTransactionStatus.Unknown
    ) {
      await AuditLog.create({
        userId: advance.userId,
        type: 'EXTERNAL_PAYMENT',
        message: 'Failed to create external payment',
        successful: false,
        extra: {
          type: 'debit-card',
          processor: ExternalTransactionProcessor.Tabapay,
          externalResponse,
          referenceNumber,
        },
      });

      throw new PaymentError('Failed to process debit card withdrawal');
    }

    let externalPayment: ExternalPayment;
    externalPayment = {
      id,
      type: ChargeableMethod.DebitCard,
      status,
      amount,
      processor: ExternalTransactionProcessor.Tabapay,
      chargeable: null,
    };

    await AuditLog.create({
      userId: advance.userId,
      type: 'EXTERNAL_PAYMENT',
      message: 'Completed external payment',
      successful: true,
      extra: { payment: externalPayment },
    });

    return externalPayment;
  };
}
