import { AdvancePayment, TransactionType } from '@dave-inc/loomis-client';
import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { NotFoundError, InvalidParametersError } from '@dave-inc/error-types';
import { Payment } from '../../models';
import { isNil } from 'lodash';
import { serializePaymentForLoomis } from './helper';

export function serializeAdvancePaymentForLoomis(payment: Payment): AdvancePayment {
  return {
    type: TransactionType.Replenishment,
    advanceId: payment.advanceId,
    bankTransactionLegacyId: payment.bankTransactionId,
    legacySynapseId: payment.legacyId,
    ...serializePaymentForLoomis(payment),
  };
}
export async function getPaymentDetails(req: Request, res: Response) {
  const { id } = req.params;
  if (isNil(id)) {
    throw new InvalidParametersError('Must supply payment ID');
  }

  let payment: Payment | null = null;
  if (id.toLowerCase() === 'latest') {
    const { userId } = req.query;
    if (isNil(userId)) {
      throw new InvalidParametersError('Must specify user ID for "latest" query');
    }

    const parsedUserId = parseInt(userId, 10);
    if (isNaN(parsedUserId)) {
      throw new InvalidParametersError(`Invalid user ID ${userId}`);
    }
    payment = await Payment.findOne({
      order: [['created', 'DESC']],
      where: { userId, status: { [Op.ne]: ExternalTransactionStatus.Canceled } },
    });
  } else {
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) {
      throw new InvalidParametersError(`Invalid payment ID ${id}`);
    }

    payment = await Payment.findByPk(parsedId);
  }

  if (isNil(payment)) {
    throw new NotFoundError();
  }

  res.json(serializeAdvancePaymentForLoomis(payment));
}

export async function findPaymentDetails(req: Request, res: Response) {
  const { userId, status, externalId, externalProcessor } = req.query;
  let payment: Payment | null = null;

  if (!!userId && !!status) {
    const parsedUserId = parseInt(userId, 10);
    if (isNaN(parsedUserId)) {
      throw new InvalidParametersError(`Invalid user ID ${userId}`);
    }

    payment = await Payment.findOne({
      where: {
        userId: parsedUserId,
        status,
      },
    });
  } else if (!!externalId && !!externalProcessor) {
    payment = await Payment.findOne({
      where: {
        externalId,
        externalProcessor,
      },
    });
  } else {
    throw new InvalidParametersError('Invalid set of parameters');
  }

  if (isNil(payment)) {
    throw new NotFoundError();
  }

  res.json(serializeAdvancePaymentForLoomis(payment));
}
