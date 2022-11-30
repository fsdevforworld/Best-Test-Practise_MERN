import { Request, Response } from 'express';
import { NotFoundError, InvalidParametersError } from '@dave-inc/error-types';
import { Payment } from '../../models';

export default async function getPaymentStatus(req: Request, res: Response) {
  const { referenceId, userId } = req.query;

  if (!referenceId && !userId) {
    throw new InvalidParametersError('Must pass referenceId and userId');
  }

  if (referenceId.length > 16) {
    throw new InvalidParametersError('Must pass a valid reference Id');
  }

  const parsedUserId = parseInt(userId, 10);
  if (isNaN(parsedUserId)) {
    throw new InvalidParametersError('Must pass a valid user Id');
  }

  const payment = await Payment.findOne({
    where: {
      referenceId,
      userId: parsedUserId,
    },
    paranoid: false,
  });

  if (payment === null) {
    throw new NotFoundError();
  }

  return res.send({ status: payment.status });
}
