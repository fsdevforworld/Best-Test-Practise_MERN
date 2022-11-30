import {
  SubscriptionPayment as LoomisSubscriptionPayment,
  TransactionType,
} from '@dave-inc/loomis-client';
import { Request, Response } from 'express';
import { NotFoundError, InvalidParametersError } from '@dave-inc/error-types';
import { SubscriptionPayment } from '../../models';
import { isNil } from 'lodash';
import { serializePaymentForLoomis } from './helper';

function serializeSubscriptionPaymentForLoomis(
  payment: SubscriptionPayment,
): LoomisSubscriptionPayment {
  return {
    type: TransactionType.SubscriptionPayment,
    ...serializePaymentForLoomis(payment),
  };
}

export default async function getSubscriptionPaymentDetails(req: Request, res: Response) {
  const { id } = req.params;
  if (isNil(id)) {
    throw new InvalidParametersError('Must supply payment ID');
  }

  const parsedId = parseInt(id, 10);
  if (isNaN(parsedId)) {
    throw new InvalidParametersError(`Invalid payment ID ${id}`);
  }

  const payment = await SubscriptionPayment.findByPk(parsedId);

  if (isNil(payment)) {
    throw new NotFoundError();
  }

  res.json(serializeSubscriptionPaymentForLoomis(payment));
}
