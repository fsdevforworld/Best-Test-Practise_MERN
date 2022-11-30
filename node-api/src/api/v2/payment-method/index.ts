import { Request, Response } from 'express';
import {
  PaymentMethodCreateResponse,
  TabapayKeyResponse,
  ExternalTransactionProcessor,
} from '@dave-inc/wire-typings';
import { AuditLog } from '../../../models';
import { verifyCard, getKey } from '../../../lib/tabapay';
import { getParams } from '../../../lib/utils';
import { IDaveRequest, IDaveResponse } from '../../../typings';
import {
  createPaymentMethod,
  getTabapayCardPayload,
  getTabapayEncryptedCardPayload,
  updatePaymentMethod,
} from './controller';

export const MIN_VERSION = '2.6.0';

export async function create(
  req: IDaveRequest,
  res: IDaveResponse<PaymentMethodCreateResponse>,
): Promise<Response> {
  const {
    tabapayEncryptedCard,
    bin,
    mask,
    expirationMonth,
    expirationYear,
    zipCode,
    optedIntoDaveRewards,
  } = getParams(
    req.body,
    ['tabapayEncryptedCard', 'bin', 'mask', 'expirationMonth', 'expirationYear'],
    ['zipCode', 'optedIntoDaveRewards'],
  );

  const { keyId, encryptedCardData } = getTabapayEncryptedCardPayload(tabapayEncryptedCard);

  try {
    const paymentMethod = await createPaymentMethod({
      user: req.user,
      bankAccountId: req.params.bankAccountId,
      keyId,
      encryptedCardData,
      bin,
      mask,
      expirationMonth,
      expirationYear,
      zipCode,
      optedIntoDaveRewards,
    });

    return res.send({
      success: true,
      message: `Debit card added and verified.`,
      paymentMethodId: paymentMethod.id,
    });
  } catch (err) {
    await AuditLog.create({
      userId: req.user.id,
      type: 'PAYMENT_METHOD_CREATE',
      message: err.message.slice(0, 255),
      successful: false,
      extra: {
        ...err,
        paymentProcessor: ExternalTransactionProcessor.Tabapay,
      },
    });
    throw err;
  }
}

export async function getEncryptionKey(
  req: Request,
  res: IDaveResponse<TabapayKeyResponse>,
): Promise<void> {
  const tabapayKey = await getKey();
  res.send(tabapayKey.serialize());
}

export async function verifyEncryptedCard(
  req: IDaveRequest,
  res: IDaveResponse<{ success: boolean }>,
): Promise<void> {
  const { encryptedCardData, keyId, owner } = getTabapayCardPayload(req.body);

  await verifyCard(encryptedCardData, keyId, owner);

  res.send({ success: true });
}

export async function update(
  req: IDaveRequest,
  res: IDaveResponse<{ success: boolean }>,
): Promise<Response> {
  const { empyrCardId, empyrUserId, optedIntoDaveRewards } = req.body;

  await updatePaymentMethod(
    req.user,
    req.params.paymentMethodId,
    empyrCardId,
    empyrUserId,
    optedIntoDaveRewards,
  );

  return res.send({
    success: true,
  });
}
