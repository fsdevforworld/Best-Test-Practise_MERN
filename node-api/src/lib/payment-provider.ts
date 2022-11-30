import { getPaymentGateway as getGateway } from '@dave-inc/loomis-client';
import { PaymentError, PaymentProcessorError, ExternalTransactionError } from './error';
import * as Tabapay from './tabapay';
import { BankAccount, BankConnection, User } from '../models';
import {
  ExternalDisbursement,
  PaymentGateway,
  PaymentProviderTransaction,
  PaymentProviderTransactionType,
} from '../typings';
import { dogstatsd } from './datadog-statsd';
import { mapTransactionStatus } from '../domain/payment-provider/index';
import {
  BankingDataSource,
  ExternalTransactionProcessor,
  PaymentProviderDelivery,
} from '@dave-inc/wire-typings';
import { PaymentMethod } from '@dave-inc/loomis-client';
import { useTabapayDisbursementsACH } from '../experiments/tabapay-ach';

export default {
  disburse,
};

async function disburse(
  user: User,
  bankAccount: BankAccount,
  paymentMethod: PaymentMethod,
  referenceId: string,
  amount: number,
  delivery: string,
): Promise<ExternalDisbursement> {
  const deliveryType = verifyDeliveryType(delivery);

  const bankConnection = await bankAccount.getBankConnection({ paranoid: false }); // We also currently use this function to do reimbursements for deleted users

  let disbursement: ExternalDisbursement;

  // Refactor this as part of payment provider domain integration
  switch (bankConnection.bankingDataSource) {
    case BankingDataSource.BankOfDave:
      disbursement = await disburseToBankOfDaveAccount(
        user,
        bankAccount,
        bankConnection,
        referenceId,
        amount,
        deliveryType,
      );
      break;
    default:
      disbursement = await disburseToPlaidAccount(
        user,
        bankAccount,
        paymentMethod,
        referenceId,
        amount,
        delivery,
      );
      break;
  }

  dogstatsd.increment('advance_disbursement.success', 1, [`delivery:${delivery}`]);
  dogstatsd.increment('advance_disbursement.successful_amount', Number(amount * 100), [
    `delivery:${delivery}`,
    `processor:${disbursement.processor}`,
  ]);
  return disbursement;
}

function verifyDeliveryType(delivery: string) {
  // @ts-ignore
  if (!PaymentProviderDelivery[delivery.toUpperCase() as any]) {
    dogstatsd.increment('advance_disbursement.invalid_delivery_type', 1, [`delivery:${delivery}`]);
    throw new PaymentError(`Invalid delivery type: ${delivery}`);
  }

  return delivery as PaymentProviderDelivery;
}

async function disburseToBankOfDaveAccount(
  user: User,
  bankAccount: BankAccount,
  bankConnection: BankConnection,
  referenceId: string,
  amount: number,
  delivery: PaymentProviderDelivery,
): Promise<ExternalDisbursement> {
  const Gateway = getGateway(PaymentGateway.BankOfDave);
  const ownerId = bankConnection.externalId;
  const sourceId = bankAccount.externalId;

  const transaction = await Gateway.createTransaction({
    type: PaymentProviderTransactionType.AdvanceDisbursement,
    ownerId,
    sourceId,
    referenceId,
    amount,
    delivery,
  });

  return convertPaymentProviderTransactionToDisbursement(transaction);
}

function convertPaymentProviderTransactionToDisbursement(
  transaction: PaymentProviderTransaction,
): ExternalDisbursement {
  try {
    const status = mapTransactionStatus(transaction.status);
    return {
      id: transaction.externalId,
      status,
      processor: transaction.processor,
    };
  } catch (error) {
    throw new ExternalTransactionError(
      'Cannot map payment provider transaction to Dave transaction',
      { transaction, originalError: error, failingService: transaction.processor },
    );
  }
}

async function getStandardDisbursement(
  user: User,
  bankAccount: BankAccount,
  referenceId: string,
  amount: number,
) {
  if (useTabapayDisbursementsACH(user.id)) {
    const Gateway = getGateway(PaymentGateway.TabapayACH);
    const externalPayment = await Gateway.createTransaction({
      type: PaymentProviderTransactionType.AdvanceDisbursement,
      sourceId: bankAccount.id.toString(),
      referenceId,
      amount,
    });
    return convertPaymentProviderTransactionToDisbursement(externalPayment);
  } else {
    const Gateway = getGateway(PaymentGateway.Synapsepay);
    const externalPayment = await Gateway.createTransaction({
      type: PaymentProviderTransactionType.AdvanceDisbursement,
      sourceId: bankAccount.synapseNodeId,
      referenceId,
      amount,
    });
    return convertPaymentProviderTransactionToDisbursement(externalPayment);
  }
}

async function getExpressDisbursement(
  paymentMethod: PaymentMethod,
  referenceId: string,
  amount: number,
) {
  if (paymentMethod.tabapayId) {
    return await Tabapay.disburse(referenceId, paymentMethod.tabapayId, amount, paymentMethod.bin);
  } else {
    throw new PaymentError('Please re-add this card', {
      data: {
        msg: 'Card does not have tabapay id',
        paymentMethod,
      },
    });
  }
}

async function disburseToPlaidAccount(
  user: User,
  bankAccount: BankAccount,
  paymentMethod: PaymentMethod,
  referenceId: string,
  amount: number,
  delivery: string,
): Promise<ExternalDisbursement> {
  if (delivery === PaymentProviderDelivery.STANDARD) {
    return getStandardDisbursement(user, bankAccount, referenceId, amount);
  } else if (delivery === PaymentProviderDelivery.EXPRESS) {
    return getExpressDisbursement(paymentMethod, referenceId, amount);
  }
}

export function checkTransactionStatusUnknown(err: PaymentProcessorError): boolean {
  const gateway = err.gateway;
  const processorHttpStatus = err.processorHttpStatus;
  return gateway === ExternalTransactionProcessor.Synapsepay && processorHttpStatus === 500;
}
