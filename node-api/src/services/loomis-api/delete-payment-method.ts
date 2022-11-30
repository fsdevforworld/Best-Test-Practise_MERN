import { Request, Response } from 'express';
import { PaymentMethod } from '../../models';
import { NotFoundError, InvalidParametersError } from '../../lib/error';
import { paymentMethodUpdateEvent } from '../../domain/event';
import logger from '../../lib/logger';

export default async function deletePaymentMethod(req: Request, res: Response) {
  const { paymentMethodId } = req.params;

  const parsedPaymentMethodId = parseInt(paymentMethodId, 10);
  if (isNaN(parsedPaymentMethodId)) {
    throw new InvalidParametersError('Must pass a valid payment method ID');
  }

  const paymentMethod = await PaymentMethod.destroy({
    force: true,
    where: { id: parsedPaymentMethodId },
  });

  if (paymentMethod === 0) {
    throw new NotFoundError();
  }

  try {
    await paymentMethodUpdateEvent.publish({
      operation: 'delete',
      paymentMethod: { legacyId: parsedPaymentMethodId },
    });
  } catch (error) {
    logger.warn('Failed to publish payment method update', {
      error,
      legacyId: parsedPaymentMethodId,
    });
  }
  return res.send({ success: true });
}
