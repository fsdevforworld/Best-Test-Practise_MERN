import {
  BaseApiError,
  CUSTOM_ERROR_CODES,
  InvalidParametersError,
  NotFoundError,
  PaymentError,
} from '../../lib/error';
import { Advance, AuditLog, BankAccount, BankConnection } from '../../models';
import { moment } from '@dave-inc/time-lib';
import { dogstatsd } from '../../lib/datadog-statsd';
import * as Tabapay from '../../lib/tabapay';
import { TivanResult } from '../../lib/tivan-client';
import {
  AdvanceCollectionTrigger,
  ExternalPaymentCreator,
  IDaveRequest,
  IDaveResponse,
} from '../../typings';
import { Response } from 'express';
import { getTabapayCardPayload } from './payment-method/controller';
import { first, get, isNil } from 'lodash';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import * as Collection from '../../domain/collection';
import * as Notification from '../../domain/notifications';
import {
  shouldProcessUserPaymentWithTivan,
  createUserPaymentTask,
  waitForTaskResult,
} from '../../domain/repayment';
import {
  ConstraintMessageKey,
  FailureMessageKey,
  InvalidParametersMessageKey,
  NotFoundMessageKey,
} from '../../translations';
import loomisClient, {
  encodePaymentMethodId,
  parsePaymentMethod,
  PaymentMethod,
  PaymentMethodId,
  PaymentMethodType,
} from '@dave-inc/loomis-client';
import { parseLoomisGetPaymentMethod } from '../../services/loomis-api/helper';
import logger from '../../lib/logger';

async function create(
  req: IDaveRequest,
  res: IDaveResponse<{ ok: boolean; id: number }>,
): Promise<Response> {
  const { amount, oneTimeCard, bankAccountId } = req.body;

  if (isNaN(amount) || amount <= 0) {
    throw new InvalidParametersError(InvalidParametersMessageKey.PaymentMustBePositive);
  }

  const advance = await Advance.findByPk(req.params.advanceId, {
    include: [
      {
        model: BankAccount,
        include: [BankConnection],
      },
    ],
  });

  if (!advance || advance.userId !== req.user.id) {
    /**
     * Obfuscate whether an advance ID exists, since
     * this endpoint may be accessible to users
     */
    throw new InvalidParametersError(NotFoundMessageKey.AdvanceNotFound);
  }
  if (moment().diff(advance.created, 'hours') < 24) {
    throw new InvalidParametersError(ConstraintMessageKey.AdvanceRequestEarlyPayment, {
      customCode: CUSTOM_ERROR_CODES.PAYMENT_CANNOT_WITHIN_24_HOURS,
    });
  }

  let charge: ExternalPaymentCreator;
  let collectionTrigger: AdvanceCollectionTrigger;
  let paymentMethod: PaymentMethod;
  if (oneTimeCard) {
    const { encryptedCardData, keyId, owner } = getTabapayCardPayload(oneTimeCard);

    // Throws error if Tabapay says card can't be used for payment.
    await Tabapay.verifyCard(encryptedCardData, keyId, owner);

    const card = { keyID: keyId, data: encryptedCardData };
    charge = Collection.createOneTimeCharge(advance, card, owner);

    collectionTrigger = AdvanceCollectionTrigger.USER_ONE_TIME_CARD;
  } else if (await shouldProcessUserPaymentWithTivan(advance.id, advance.userId)) {
    return processUserPayment(advance, bankAccountId, amount, res);
  } else {
    paymentMethod = await getDebitPaymentMethod(advance, bankAccountId, amount);
    charge = await Collection.createDefaultCharge(advance, paymentMethod);
    collectionTrigger = AdvanceCollectionTrigger.USER;
  }

  let collectionAttempt;
  try {
    if (!oneTimeCard) {
      validateUserPaymentAmount(advance.bankAccount, amount);
    }

    collectionAttempt = await Collection.collectAdvance(advance, amount, charge, collectionTrigger);
  } catch (error) {
    dogstatsd.increment('manual_payback.error_creating_payment');
    await AuditLog.create({
      userId: advance.userId,
      type: 'MANUAL_PAYMENT_CREATE',
      message: `Error creating ${amount} payment`,
      successful: false,
      eventUuid: advance.id,
      extra: { error },
    });
    throw error;
  }

  if (collectionAttempt.successful()) {
    const payment = await collectionAttempt.getPayment();

    if (payment.status === ExternalTransactionStatus.Completed) {
      await Notification.sendPayment(payment.id);
    }

    await AuditLog.create({
      userId: advance.userId,
      type: 'MANUAL_PAYMENT_CREATE',
      message: `User manually created ${payment.amount} payment`,
      successful: true,
      eventUuid: advance.id,
      extra: { payment },
    });

    // TODO: Maybe standardize this to data at some point so it can utilize StandardResponse
    return res.send({ ok: true, id: payment.id });
  } else {
    humanizeCollectionFailures(collectionAttempt.extra.err);
  }
}

async function createWithToken(
  req: IDaveRequest,
  res: IDaveResponse<{ id: number }>,
): Promise<void> {
  const { amount, token, advanceId } = req.body;

  if (!amount || !token || !advanceId) {
    throw new InvalidParametersError(null, {
      required: ['amount', 'token', 'advanceId'],
      provided: Object.keys(req.body),
    });
  }

  if (isNaN(amount) || amount <= 0) {
    throw new InvalidParametersError(InvalidParametersMessageKey.PaymentMustBePositive);
  }

  const advance = await Advance.findByPk(advanceId);

  if (!advance) {
    throw new NotFoundError(NotFoundMessageKey.AdvanceNotFoundById, {
      interpolations: { advanceId },
    });
  }

  const cardInfo = { token };
  const charge = Collection.createOneTimeCharge(advance, cardInfo);

  const collectionAttempt = await Collection.collectAdvance(
    advance,
    amount,
    charge,
    AdvanceCollectionTrigger.USER_WEB,
  );

  if (collectionAttempt.successful()) {
    const payment = await collectionAttempt.getPayment();

    await AuditLog.create({
      userId: advance.userId,
      type: 'WEB_PAYMENT_CREATE',
      message: `Website user created ${payment.amount} payment`,
      successful: true,
      eventUuid: advance.id,
      extra: { payment },
    });

    res.status(201).send({ id: payment.id });
  } else {
    humanizeCollectionFailures(collectionAttempt.extra.err);
  }
}

function humanizeCollectionFailures(ex: BaseApiError): never {
  if (ex.message === 'Failed collection validations') {
    throw new InvalidParametersError(
      (ex.data as Array<{ params: { message: string } }>)[0].params.message,
    );
  } else if (
    ex.message === 'Failed to process ach withdrawal' ||
    ex.message === 'Failed to process debit card withdrawal'
  ) {
    throw new PaymentError(FailureMessageKey.TransactionProcessingFailure);
  }

  throw ex;
}

function validateUserPaymentAmount(bankAccount: BankAccount, amount: number) {
  const hasSufficientBalance = Collection.validateUserPaymentAmount(amount, {
    available: bankAccount.available,
    current: bankAccount.current,
  });

  if (!hasSufficientBalance) {
    throw new InvalidParametersError(InvalidParametersMessageKey.PaymentTooLargeForAccountBalance);
  }
}

async function getDebitPaymentMethod(
  advance: Advance,
  bankAccountId: number,
  amount: number,
): Promise<PaymentMethod | null> {
  let paymentMethod: PaymentMethod | null = null;

  // This handles the case where the user wants to pay back an old advance which was taken
  // out against an old BankAccount that has a deleted BankConnection.
  // Then we use the bankAccountId passed into the request with its defaultPaymentMethod
  if (!get(advance, 'bankAccount.bankConnection')) {
    const bankAccount = await BankAccount.findByPk(bankAccountId);
    if (!bankAccount) {
      dogstatsd.increment('manual_payback.bank_account_not_found');
      throw new NotFoundError(NotFoundMessageKey.BankAccountNotFound);
    }

    if (bankAccount.userId !== advance.userId) {
      throw new NotFoundError(NotFoundMessageKey.BankAccountNotFound);
    }

    validateUserPaymentAmount(bankAccount, amount);

    const loomisResponse = await loomisClient.getPaymentMethod({
      id: bankAccount.defaultPaymentMethodId,
    });
    paymentMethod = parseLoomisGetPaymentMethod(loomisResponse, __filename);

    if (!paymentMethod) {
      dogstatsd.increment('manual_payback.default_payment_method_not_found');
      throw new NotFoundError(NotFoundMessageKey.PaymentMethodNotFound);
    }

    advance.bankAccount = bankAccount;
  } else if (!isNil(advance.paymentMethodId)) {
    const loomisResponse = await loomisClient.getPaymentMethod({
      id: advance.paymentMethodId,
      includeSoftDeleted: true,
    });
    paymentMethod = parseLoomisGetPaymentMethod(loomisResponse, __filename);
  }

  return paymentMethod;
}

async function getBankPaymentMethod(
  userId: number,
  bankAccountId: number,
): Promise<PaymentMethod | null> {
  const includeBankAccounts = true;
  // Assume BANK type bank account. Loomis will update to
  // DAVE type if necessary
  const assumedLoomisId = encodePaymentMethodId({
    type: PaymentMethodType.BANK_ACCOUNT,
    id: bankAccountId,
  });
  const loomisResponse = await loomisClient.getPaymentMethods(userId, {
    includeBankAccounts,
    paymentMethodIds: [assumedLoomisId],
  });

  if ('data' in loomisResponse) {
    return first(loomisResponse.data);
  }
}

async function getLoomisPaymentMethodId(
  advance: Advance,
  bankAccountId: number,
  amount: number,
): Promise<PaymentMethodId> {
  let loomisPaymentMethod = await getDebitPaymentMethod(advance, bankAccountId, amount);
  if (isNil(loomisPaymentMethod)) {
    loomisPaymentMethod = await getBankPaymentMethod(advance.userId, bankAccountId);
    if (isNil(loomisPaymentMethod)) {
      logger.error('Loomis bank payment method not found', {
        userId: advance.userId,
        bankAccountId,
      });
      throw new NotFoundError(NotFoundMessageKey.BankAccountNotFound);
    }
  }
  return parsePaymentMethod(loomisPaymentMethod.universalId);
}

async function processUserPayment(
  advance: Advance,
  bankAccountId: number,
  amount: number,
  res: IDaveResponse<{ ok: boolean; id: number }>,
): Promise<Response> {
  // TODO: distinguish from user-web?

  const refreshedAdvance = await Collection.updateOutstanding(advance);
  const trigger = AdvanceCollectionTrigger.USER;

  // prevent dupe charges on advances with no outstanding balance
  if (refreshedAdvance.outstanding <= 0) {
    logger.error('Outstanding advance amount must be greater than 0. Failed to process payment', {
      trigger,
      advanceId: refreshedAdvance.id,
    });
    return res.status(424).send({ message: 'Outstanding advance amount must be greater than 0' });
  }
  const paymentMethodId = await getLoomisPaymentMethodId(advance, bankAccountId, amount);
  const taskId = await createUserPaymentTask(advance, trigger, paymentMethodId, amount);
  const taskStatus = await waitForTaskResult(taskId);

  const taskResult = taskStatus?.result ?? null;
  switch (taskResult) {
    case TivanResult.Pending:
    case TivanResult.Success: {
      const [paymentResult] = taskStatus.successfulPayments;
      return res.status(200).send({ ok: true, id: paymentResult?.taskPaymentResultId });
    }
    case TivanResult.Failure:
    case TivanResult.Error:
      // TODO: be more nuanced with the error type, once Tivan exposes that
      return res.status(424).send({ message: 'Failed to process payment' });
    default:
      // we timed out before confirming a task was created
      logger.error('Failed to get create Tivan payment task  confirmation', {
        trigger,
        advanceId: advance.id,
        taskId,
      });
      return res.status(424).send({ message: 'Unknown payment task status' });
  }
}

export default { create, createWithToken };
