import { InvalidParametersError, NotFoundError, NotImplementedError } from '@dave-inc/error-types';
import {
  parsePaymentMethod,
  PaymentMethodType,
  PaymentProcessor,
  PaymentProviderTransaction,
  PaymentProviderTransactionStatus,
} from '@dave-inc/loomis-client';
import {
  BankingDataSource,
  ExternalTransactionProcessor,
  ExternalTransactionStatus,
} from '@dave-inc/wire-typings';
import { moment } from '@dave-inc/time-lib';
import { Request, Response } from 'express';
import * as Collection from '../../domain/collection';
import {
  clearStaleCollectionAttempts,
  createCollectionAttempt,
} from '../../domain/collection/collect-advance';
import { retrieve as chargeACH } from '../../domain/collection/charge-bank-account';
import { ExternalTransactionError, PaymentProcessorError } from '../../lib/error';
import logger from '../../lib/logger';
import { retrieve as chargeDebit, invalidResponseCodes, isNetworkRC } from '../../lib/tabapay';
import {
  Advance,
  AdvanceCollectionAttempt,
  AuditLog,
  BankAccount,
  BankConnection,
  Payment,
  PaymentMethod,
  User,
} from '../../models';
import { CUSTOM_ERROR_CODES } from '../../lib/error';
import {
  AdvanceCollectionTrigger,
  CreateTransactionOptions,
  PaymentGateway,
  PaymentProviderTransactionType,
} from '../../typings';
import { centsToDollars, dollarsToCents } from './helper';
import { validatePredictedOutstanding } from '../../domain/collection/outstanding';
import { publishPaymentCreationEvent } from '../../domain/payment';
import { useTabapayRepaymentsACH } from '../../experiments/tabapay-ach';
import { pick } from 'lodash';

const { BankOfDave, Synapsepay, Tabapay, TabapayACH } = PaymentGateway;

type CreatePayloadOptions = {
  amount: number;
  paymentMethodId: string | number;
  referenceId: string;
};

type ExpandedCreateTransactionOptions = CreateTransactionOptions & {
  bankAccount?: BankAccount;
  externalProcessor?: ExternalTransactionProcessor;
  user?: User;
};

type CreatePayloadResult = {
  payload: ExpandedCreateTransactionOptions;
  gatewayName: PaymentGateway;
};

const AUDIT_LOG_TYPE = 'tivan_loomis_log';

function mapExternalStatus(
  externalTransactionStatus: ExternalTransactionStatus,
): PaymentProviderTransactionStatus {
  const mapping: any = {
    [ExternalTransactionStatus.Canceled]: PaymentProviderTransactionStatus.Canceled,
    [ExternalTransactionStatus.Completed]: PaymentProviderTransactionStatus.Completed,
    [ExternalTransactionStatus.Pending]: PaymentProviderTransactionStatus.Pending,
    [ExternalTransactionStatus.Returned]: PaymentProviderTransactionStatus.Returned,
    [ExternalTransactionStatus.Unknown]: PaymentProviderTransactionStatus.Pending,
  };

  const paymentProviderTransactionStatus = mapping[externalTransactionStatus];

  if (!paymentProviderTransactionStatus) {
    return PaymentProviderTransactionStatus.InvalidRequest;
  }

  return paymentProviderTransactionStatus;
}

function mapPaymentProcessor(externalProcessor: ExternalTransactionProcessor): PaymentProcessor {
  const mapping: any = {
    [ExternalTransactionProcessor.Tabapay]: PaymentProcessor.Tabapay,
    [ExternalTransactionProcessor.Synapsepay]: PaymentProcessor.Synapsepay,
    [ExternalTransactionProcessor.BankOfDave]: PaymentProcessor.BankOfDave,
  };

  return mapping[externalProcessor];
}

function sanitizePayload(options: CreatePayloadResult) {
  return {
    userId: options.payload.user?.id,
    bankAccountId: options.payload.bankAccount?.id,
    gateway: options.gatewayName,

    ...pick(options.payload, [
      'type',
      'referenceId',
      'ownerId',
      'correspondingId',
      'amount',
      'delivery',
      'externalProcessor',
    ]),
  };
}

function serializeACHResponse(
  achOptions: CreatePayloadResult,
  rawACHResponse: {
    id: string;
    status: ExternalTransactionStatus;
  },
): PaymentProviderTransaction {
  const { gatewayName, payload: paymentPayload } = achOptions;

  const response = {
    amount: dollarsToCents(paymentPayload.amount),
    externalId: rawACHResponse.id,
    referenceId: paymentPayload.referenceId,
    reversalStatus: null as any,
    gateway: gatewayName,
    processor: mapPaymentProcessor(paymentPayload.externalProcessor),
    status: mapExternalStatus(rawACHResponse.status),
  };

  return response;
}

async function createAchPayload({
  amount,
  paymentMethodId,
  referenceId,
}: CreatePayloadOptions): Promise<CreatePayloadResult> {
  let ownerId: string;
  let sourceId: string;
  let gatewayName: PaymentGateway;
  let externalProcessor: ExternalTransactionProcessor;

  const bankAccountRow = await BankAccount.findByPk(paymentMethodId);
  if (!bankAccountRow) {
    throw new NotFoundError('Missing provided bank account');
  }

  const user = await User.findByPk(bankAccountRow.userId);

  const { bankConnectionId, externalId, synapseNodeId } = bankAccountRow;
  const { bankingDataSource, externalId: connectionExternalId } = await BankConnection.findByPk(
    bankConnectionId,
  );

  if (bankingDataSource === BankingDataSource.BankOfDave) {
    gatewayName = BankOfDave;
    ownerId = connectionExternalId;
    sourceId = externalId;
    externalProcessor = ExternalTransactionProcessor.BankOfDave;
  } else {
    if (useTabapayRepaymentsACH(user.id)) {
      gatewayName = TabapayACH;
      sourceId = externalId;
      externalProcessor = ExternalTransactionProcessor.TabapayACH;
    } else {
      gatewayName = Synapsepay;
      sourceId = synapseNodeId;
      externalProcessor = ExternalTransactionProcessor.Synapsepay;
    }
  }

  return {
    payload: {
      type: PaymentProviderTransactionType.AdvancePayment,
      referenceId,
      amount,
      bankAccount: bankAccountRow,
      externalProcessor,
      ownerId,
      sourceId,
      user,
    },
    gatewayName,
  };
}

function serializeDebitResponse(
  debitOptions: CreatePayloadResult,
  rawDebitResponse: {
    id: string;
    status: ExternalTransactionStatus;
  },
): PaymentProviderTransaction {
  const { gatewayName, payload: paymentPayload } = debitOptions;

  const response = {
    amount: dollarsToCents(paymentPayload.amount),
    externalId: rawDebitResponse.id,
    referenceId: paymentPayload.referenceId,
    reversalStatus: null as any,
    gateway: gatewayName,
    processor: mapPaymentProcessor(paymentPayload.externalProcessor),
    status: mapExternalStatus(rawDebitResponse.status),
  };

  return response;
}

async function createDebitPayload({
  amount,
  paymentMethodId,
  referenceId,
}: CreatePayloadOptions): Promise<CreatePayloadResult> {
  const paymentMethod = await PaymentMethod.findByPk(paymentMethodId);
  if (!paymentMethod || !paymentMethod.tabapayId) {
    throw new NotFoundError('Missing provided payment method');
  }

  const user = await User.findByPk(paymentMethod.userId);

  return {
    payload: {
      type: PaymentProviderTransactionType.AdvancePayment,
      referenceId,
      amount,
      externalProcessor: ExternalTransactionProcessor.Tabapay,
      sourceId: paymentMethod.tabapayId,
      user,
    },
    gatewayName: Tabapay,
  };
}

async function invalidateDebitCard(paymentMethodId: string | number, processorResponse: string) {
  const paymentMethod = await PaymentMethod.findByPk(paymentMethodId);
  try {
    await paymentMethod.update({
      invalid: moment(),
      invalidReasonCode: processorResponse,
    });
  } catch (error) {
    logger.error('Failed invalidating payment method.', {
      paymentMethodId,
      processorResponse,
      error,
    });
  }
}

export default async function postPayment(req: Request, res: Response) {
  const {
    advanceId,
    paymentMethodId: paymentMethodUniversalId,
    amount: amountInCents,
    referenceId,
  } = req.body;

  if (!advanceId) {
    throw new InvalidParametersError('Must include an advance Id');
  }

  if (!paymentMethodUniversalId) {
    throw new InvalidParametersError('Must include a payment method Id');
  }

  if (!referenceId || referenceId.length > 16) {
    throw new InvalidParametersError('Must include a valid reference Id');
  }

  if (amountInCents > 0) {
    throw new NotImplementedError('Cannot disburse funds');
  }

  const advance = await Advance.findByPk(advanceId);
  const amount = centsToDollars(Math.abs(amountInCents));
  const trigger = req.body.trigger ?? AdvanceCollectionTrigger.TIVAN;

  let paymentType: PaymentMethodType;
  let paymentMethodId: string | number;
  try {
    const paymentMethodObject = parsePaymentMethod(paymentMethodUniversalId);
    paymentType = paymentMethodObject.type;
    paymentMethodId = paymentMethodObject.id;
  } catch {
    throw new InvalidParametersError('Must include a valid payment method Id');
  }

  await clearStaleCollectionAttempts(advance);
  const collectionAttempt = await createCollectionAttempt(advance, amount, trigger);
  let response: PaymentProviderTransaction;
  try {
    await validatePredictedOutstanding(advance, amount);
    response = await createTransaction(
      advance,
      amount,
      paymentType,
      paymentMethodId,
      referenceId,
      collectionAttempt,
      trigger,
    );
  } catch (error) {
    throw error;
  } finally {
    await collectionAttempt.update({ processing: null });
  }

  return res.json(response);
}

async function createTransaction(
  advance: Advance,
  amount: number,
  paymentType: PaymentMethodType,
  paymentMethodId: string | number,
  referenceId: string,
  collectionAttempt: AdvanceCollectionAttempt,
  trigger: string,
): Promise<PaymentProviderTransaction> {
  let serializedResponse: PaymentProviderTransaction;
  let payment: Payment;
  if (paymentType === PaymentMethodType.DEBIT_CARD) {
    const options = await createDebitPayload({ amount, paymentMethodId, referenceId });
    const paymentPayload = options.payload;

    logger.info('Initiating a debit payment', sanitizePayload(options));
    payment = await Payment.create({
      advanceId: advance.id,
      externalProcessor: paymentPayload.externalProcessor,
      userId: paymentPayload.user.id,
      amount,
      paymentMethodId,
      referenceId,
      status: ExternalTransactionStatus.Pending,
    });
    await collectionAttempt.update({ paymentId: payment.id });

    try {
      const rawDebitResponse = await chargeDebit(
        referenceId,
        paymentPayload.sourceId,
        paymentPayload.amount,
      );

      await payment.update({
        externalId: rawDebitResponse.id,
        status: rawDebitResponse.status,
      });

      await Promise.all([
        publishPaymentCreationEvent(PaymentProviderTransactionType.AdvancePayment, payment),
        Collection.updateOutstanding(advance),
      ]);
      serializedResponse = serializeDebitResponse(options, rawDebitResponse);
    } catch (err) {
      logger.error('Failed to create a payment for Tivan', {
        error: err,
        referenceId,
        transactionType: 'debit',
      });

      await AuditLog.create({
        userId: advance.userId,
        type: AUDIT_LOG_TYPE,
        successful: false,
        message: 'Failed to create a payment for Tivan',
        eventUuid: payment.id,
        extra: {
          referenceId,
          transactionType: 'debit-card',
          err,
          trigger,
        },
      });

      let status = ExternalTransactionStatus.Unknown;

      if (
        err instanceof PaymentProcessorError &&
        invalidResponseCodes.includes(err.processorResponse)
      ) {
        status = ExternalTransactionStatus.Canceled;
        await invalidateDebitCard(paymentMethodId, err.processorResponse);
      } else if (err.customCode === CUSTOM_ERROR_CODES.BANK_DENIED_CARD) {
        status = ExternalTransactionStatus.Canceled;
      }

      payment = await payment.update({ status });

      await publishPaymentCreationEvent(PaymentProviderTransactionType.AdvancePayment, payment);

      if (err.customCode === CUSTOM_ERROR_CODES.BANK_DENIED_CARD) {
        const outcome = isNetworkRC(err.processorResponse)
          ? { code: err.processorResponse }
          : undefined;
        return {
          amount: dollarsToCents(paymentPayload.amount),
          externalId: null,
          referenceId: paymentPayload.referenceId,
          reversalStatus: null as any,
          gateway: Tabapay,
          outcome,
          processor: mapPaymentProcessor(paymentPayload.externalProcessor),
          status: PaymentProviderTransactionStatus.InvalidRequest,
        };
      }
    }
  } else {
    const options = await createAchPayload({ amount, paymentMethodId, referenceId });
    const paymentPayload = options.payload;

    logger.info('Initiating an ACH payment', sanitizePayload(options));
    payment = await Payment.create({
      advanceId: advance.id,
      externalProcessor: paymentPayload.externalProcessor,
      userId: paymentPayload.user.id,
      amount,
      bankAccountId: paymentPayload.bankAccount.id,
      referenceId,
      status: ExternalTransactionStatus.Pending,
    });
    await collectionAttempt.update({ paymentId: payment.id });

    let rawACHResponse;
    try {
      rawACHResponse = await chargeACH(
        paymentPayload.bankAccount,
        paymentPayload.referenceId,
        paymentPayload.user,
        paymentPayload.externalProcessor,
        paymentPayload.amount,
        {
          transactionType: paymentPayload.type,
        },
      );

      payment = await payment.update({
        externalId: rawACHResponse.id,
        status: rawACHResponse.status,
      });

      await Promise.all([
        publishPaymentCreationEvent(PaymentProviderTransactionType.AdvancePayment, payment),
        Collection.updateOutstanding(advance),
      ]);

      serializedResponse = serializeACHResponse(options, rawACHResponse);
    } catch (error) {
      await AuditLog.create({
        userId: advance.userId,
        type: AUDIT_LOG_TYPE,
        successful: false,
        message: 'Failed to create a payment for Tivan',
        eventUuid: payment.id,
        extra: {
          referenceId,
          transactionType: 'ach',
          err: error,
          trigger,
        },
      });

      await payment.update({
        status: ExternalTransactionStatus.Unknown,
      });

      const safePayload = {
        referenceId: paymentPayload.referenceId,
        externalProcessor: paymentPayload.externalProcessor,
        sourceId: paymentPayload.sourceId,
        type: paymentPayload.type,
        amount: paymentPayload.amount,
      };

      logger.error('Failed to create a payment for Tivan', {
        error,
        transactionType: 'ach',
        ...safePayload,
      });
      throw new ExternalTransactionError('Error creating ACH charge', {
        transaction: safePayload,
        originalError: error,
        failingService: paymentPayload.externalProcessor,
      });
    }
  }

  return serializedResponse;
}
