import { Request, Response } from 'express';
import { NotFoundError, InvalidParametersError } from '@dave-inc/error-types';
import { Payment } from '../../models';
import { isNil, isEmpty } from 'lodash';
import { WhereOptions } from 'sequelize/types';
import { serializeAdvancePaymentForLoomis } from './get-payment-details';

export default async function getPayments(req: Request, res: Response) {
  const { includeSoftDeleted = false, limit = 100 } = req.query;
  const where: WhereOptions = getPaymentsWhere(req.query);
  const paranoid = !includeSoftDeleted;
  let payments: Payment[] = [];

  payments = await Payment.findAll({
    order: [['created', 'DESC']],
    limit,
    where,
    paranoid,
  });

  if (isEmpty(payments)) {
    throw new NotFoundError();
  }

  res.json(payments.map(serializeAdvancePaymentForLoomis));
}

function getPaymentsWhere(query: any): WhereOptions {
  const { userId, advanceId } = query;

  if (isNil(userId) && isNil(advanceId)) {
    throw new InvalidParametersError('Must supply a userId or advanceId');
  }

  if (!isNil(advanceId) && !isNil(userId)) {
    return { userId, advanceId };
  }

  if (!isNil(advanceId)) {
    return { advanceId };
  }

  if (!isNil(userId)) {
    return { userId };
  }

  return {};
}
