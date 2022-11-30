import { getPaymentGateway as getGateway } from '@dave-inc/loomis-client';
import { Advance, AuditLog, BankAccount, BankConnection, Payment, User } from '../../models';
import {
  ChargeableMethod,
  ExternalPayment,
  ExternalPaymentCreator,
  PaymentGateway,
  PaymentLikeObject,
  PaymentProviderTransactionType,
} from '../../typings';
import {
  BankingDataSource,
  ExternalTransactionProcessor,
  ExternalTransactionStatus,
} from '@dave-inc/wire-typings';
import {
  InvalidParametersError,
  PaymentError,
  UnsupportedPaymentProcessorError,
} from '../../lib/error';
import { Moment } from 'moment';
import { moment } from '@dave-inc/time-lib';
import * as ACH from './ach';
import * as SynapsepayUserLib from '../synapsepay/user';
import SynapsepayNodeLib from '../synapsepay/node';
import { mapTransactionStatus } from '../payment-provider';
import { fetchName } from '../../helper/user';
import { CollectionFailures } from './enums';
import { useTabapayRepaymentsACH } from '../../experiments/tabapay-ach';

function getExternalProcessor(
  userId: number,
  bankConnection: BankConnection,
): ExternalTransactionProcessor {
  const isBod = bankConnection.bankingDataSource === BankingDataSource.BankOfDave;
  if (isBod) {
    return ExternalTransactionProcessor.BankOfDave;
  }

  if (useTabapayRepaymentsACH(userId)) {
    return ExternalTransactionProcessor.TabapayACH;
  }

  return ExternalTransactionProcessor.Synapsepay;
}

export async function chargeBankAccount(
  bankAccount: BankAccount,
  amount: number,
  paymentObject: PaymentLikeObject,
  {
    isSameDay = true,
    transactionType,
    advanceExternalId,
  }: {
    isSameDay?: boolean;
    transactionType: PaymentProviderTransactionType;
    advanceExternalId?: string;
  },
): Promise<ExternalPayment> {
  const user = bankAccount.user || (await bankAccount.getUser());
  const bankConnection = bankAccount.bankConnection || (await bankAccount.getBankConnection());
  const externalProcessor = getExternalProcessor(user.id, bankConnection);

  await paymentObject.update({
    externalProcessor,
    bankAccountId: bankAccount.id,
    paymentMethodId: null,
  });

  if (user.fraud) {
    throw new PaymentError('Transaction not allowed: user suspected of fraud');
  }

  let id: string;
  let status: ExternalTransactionStatus;
  let externalResponse: { id: string; status: ExternalTransactionStatus };

  try {
    externalResponse = await retrieve(
      bankAccount,
      paymentObject.referenceId,
      user,
      externalProcessor,
      amount,
      {
        transactionType,
        isSameDay,
        advanceExternalId,
      },
    );

    id = externalResponse.id;
    status = externalResponse.status;

    const successfulStatuses = [
      ExternalTransactionStatus.Completed,
      ExternalTransactionStatus.Pending,
      ExternalTransactionStatus.Unknown,
    ];

    if (!successfulStatuses.includes(status)) {
      throw new PaymentError('Failed to process ach withdrawal');
    }
  } catch (ex) {
    await AuditLog.create({
      userId: user.id,
      type: 'EXTERNAL_PAYMENT',
      message: ex.message,
      successful: false,
      eventUuid: bankAccount.id,
      extra: {
        type: 'ach',
        processor: externalProcessor,
        externalResponse,
        transactionType,
        advanceExternalId,
      },
    });

    throw ex;
  }

  const externalPayment: ExternalPayment = {
    id,
    type: ChargeableMethod.Ach,
    status,
    amount,
    processor: externalProcessor,
    chargeable: bankAccount,
  };

  await AuditLog.create({
    userId: user.id,
    type: 'EXTERNAL_PAYMENT',
    message: 'Completed external payment',
    successful: true,
    eventUuid: bankAccount.id,
    extra: {
      payment: externalPayment,
      transactionType,
      advanceExternalId,
    },
  });

  return externalPayment;
}

export function createBankAccountAdvanceCharge(
  bankAccount: BankAccount,
  advance: Advance,
): ExternalPaymentCreator {
  const chargeFn = async (
    amount: number,
    paymentObject: PaymentLikeObject,
    time: Moment = moment(),
  ) => {
    await bankAccount.reload({ include: [BankConnection, User] });
    if (bankAccount.bankConnection.bankingDataSource !== BankingDataSource.BankOfDave) {
      if (!ACH.isInSameDayACHCollectionWindow(time)) {
        throw new PaymentError(CollectionFailures.TimeOutsideACHCollection);
      }

      const payments = await Payment.findAll({ where: { advanceId: advance.id } });

      validatePreviousPayments(payments);
    }

    return chargeBankAccount(bankAccount, amount, paymentObject, {
      transactionType: PaymentProviderTransactionType.AdvancePayment,
      advanceExternalId: advance.externalId,
    });
  };

  return chargeFn;
}

function validatePreviousPayments(payments: Payment[]) {
  const hasRecentPayment = payments.some(payment => {
    const createdRecently = moment().diff(payment.created, 'hours') < 72;
    const externalId = payment.externalId;
    return createdRecently && !!externalId;
  });

  if (hasRecentPayment) {
    throw new PaymentError('Cannot make multiple payments within 72 hours');
  }
}

export async function retrieve(
  bankAccount: BankAccount,
  referenceId: string,
  user: User,
  processor: ExternalTransactionProcessor,
  amount: number,
  {
    isSameDay = true,
    transactionType,
    advanceExternalId,
  }: {
    isSameDay?: boolean;
    transactionType?: PaymentProviderTransactionType;
    advanceExternalId?: string;
  } = {},
): Promise<{ id: string; status: ExternalTransactionStatus }> {
  if (processor === ExternalTransactionProcessor.Risepay) {
    throw new UnsupportedPaymentProcessorError('Risepay is no longer supported');
  } else if (processor === ExternalTransactionProcessor.BankOfDave) {
    return createBankOfDaveTransaction({
      bankAccount,
      transactionType,
      referenceId,
      amount,
      advanceExternalId,
    });
  } else if (processor === ExternalTransactionProcessor.Synapsepay) {
    if (!user.synapsepayId) {
      await SynapsepayUserLib.upsertSynapsePayUser(user, undefined, {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      });
    }
    if (!bankAccount.synapseNodeId) {
      await SynapsepayNodeLib.createSynapsePayNode(user, bankAccount);
    }
    return SynapsepayNodeLib.charge(user, bankAccount, amount, referenceId, {
      isSameDay,
      transactionType,
    });
  } else if (processor === ExternalTransactionProcessor.TabapayACH) {
    return createTabapayAchTransaction({
      bankAccount,
      transactionType,
      referenceId,
      amount,
      advanceExternalId,
    });
  } else {
    throw new PaymentError(`Cannot charge through ${processor}`);
  }
}

async function createBankOfDaveTransaction({
  bankAccount,
  transactionType,
  referenceId,
  amount,
  advanceExternalId,
}: {
  bankAccount: BankAccount;
  transactionType: PaymentProviderTransactionType;
  referenceId: string;
  amount: number;
  advanceExternalId?: string;
}) {
  await bankAccount.reload({ include: [BankConnection] });

  const bodGateway = getGateway(PaymentGateway.BankOfDave);

  const transaction = await bodGateway.createTransaction({
    ownerId: bankAccount.bankConnection.externalId,
    sourceId: bankAccount.externalId,
    type: transactionType,
    referenceId,
    amount,
    correspondingId: advanceExternalId,
  });

  return {
    id: transaction.externalId,
    status: mapTransactionStatus(transaction.status),
  };
}

async function createTabapayAchTransaction({
  bankAccount,
  transactionType,
  referenceId,
  amount,
  advanceExternalId,
}: {
  bankAccount: BankAccount;
  transactionType: PaymentProviderTransactionType;
  referenceId: string;
  amount: number;
  advanceExternalId?: string;
}) {
  await bankAccount.reload({ include: [BankConnection] });
  const gateway = getGateway(PaymentGateway.TabapayACH);

  const transaction = await gateway.createTransaction({
    ownerId: bankAccount.bankConnection.externalId,
    sourceId: bankAccount.id.toString(),
    type: transactionType,
    referenceId,
    amount,
    correspondingId: advanceExternalId,
  });

  return {
    id: transaction.externalId,
    status: mapTransactionStatus(transaction.status),
  };
}

export async function createBankAccountSubscriptionCharge(
  bankAccount: BankAccount,
  {
    time: time = moment(),
    shouldCheckACHWindow: shouldCheckACHWindow = true,
  }: { time?: Moment; shouldCheckACHWindow?: boolean } = {},
) {
  await bankAccount.reload({ include: [BankConnection, User] });
  const user = bankAccount.user;

  const failures = [];

  if (bankAccount.bankConnection.bankingDataSource === BankingDataSource.BankOfDave) {
    failures.push('Cannot charge a dave banking account for subscriptions');
  } else {
    const name = await fetchName(user);

    if (!name.firstName || !name.lastName) {
      failures.push('User does not have a name');
      // Synapsepay requirement
    } else if (name.firstName.length < 2 || name.lastName.length < 2) {
      failures.push("User's name is too short");
    }

    if (!bankAccount.microDepositComplete()) {
      failures.push('Micro deposit not completed');
    }

    if (shouldCheckACHWindow && !ACH.isInSameDayACHCollectionWindow(time)) {
      failures.push(CollectionFailures.TimeOutsideACHCollection);
    }
  }

  if (failures.length > 0) {
    throw new InvalidParametersError('Bank account ineligible for collection', {
      data: { failures },
    });
  }

  const chargeFn = async (
    amount: number,
    paymentObject: PaymentLikeObject,
    currentTime?: Moment,
    options: { isSameDay?: boolean } = {},
  ) => {
    try {
      return await chargeBankAccount(bankAccount, amount, paymentObject, {
        transactionType: PaymentProviderTransactionType.SubscriptionPayment,
        ...options,
      });
    } catch (ex) {
      // NOTE: Until we refactor, this will solve the issue of not knowing what type of charge threw an error
      ex.extraPaymentData = {
        bankAccountId: bankAccount.id,
      };
      throw ex;
    }
  };
  return chargeFn;
}
