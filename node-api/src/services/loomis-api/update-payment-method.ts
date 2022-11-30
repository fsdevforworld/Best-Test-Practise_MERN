import { Request, Response } from 'express';
import { PaymentMethod } from '../../models';
import { InvalidParametersError, NotFoundError } from '../../lib/error';
import { paymentMethodModelToType } from '../../typings';
import { Moment } from 'moment';
import { moment } from '@dave-inc/time-lib';

type PaymentMethodUpdateFields = {
  invalid?: Moment;
  invalidReasonCode?: string;
  optedIntoDaveRewards?: boolean;
  empyrCardId?: number;
  linked?: boolean;
};

export default async function updatePaymentMethod(req: Request, res: Response) {
  const { paymentMethodId } = req.params;
  const { invalidReasonCode, optedIntoDaveRewards, empyrCardId, linked } = req.body;

  const updateOptionsProvided =
    invalidReasonCode ||
    typeof optedIntoDaveRewards !== 'undefined' ||
    empyrCardId ||
    typeof linked !== 'undefined';

  const parsedPaymentMethodId = parseInt(paymentMethodId, 10);
  if (isNaN(parsedPaymentMethodId)) {
    throw new InvalidParametersError('Must pass a valid payment method ID');
  }

  if (!updateOptionsProvided) {
    throw new InvalidParametersError('Missing update options');
  }

  const paymentMethodToUpdate = await PaymentMethod.findByPk(parsedPaymentMethodId);

  if (paymentMethodToUpdate === null) {
    throw new NotFoundError();
  }

  const fieldsToUpdate: PaymentMethodUpdateFields = {};

  if (!!invalidReasonCode) {
    fieldsToUpdate.invalid = moment();
    fieldsToUpdate.invalidReasonCode = invalidReasonCode;
  }

  if (typeof optedIntoDaveRewards !== 'undefined') {
    fieldsToUpdate.optedIntoDaveRewards = optedIntoDaveRewards;
  }

  if (!!empyrCardId) {
    fieldsToUpdate.empyrCardId = empyrCardId;
  }

  if (typeof linked !== 'undefined') {
    fieldsToUpdate.linked = linked;
  }

  await paymentMethodToUpdate.update(fieldsToUpdate);

  const updatedPaymentMethod = paymentMethodModelToType(paymentMethodToUpdate);

  return res.json(updatedPaymentMethod);
}
