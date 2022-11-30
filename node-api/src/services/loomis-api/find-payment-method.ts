import { Request, Response } from 'express';
import { WhereOptions, Op } from 'sequelize';
import { isEmpty } from 'lodash';
import { PaymentMethod as PaymentMethodLoomis } from '@dave-inc/loomis-client';
import { BankAccount, PaymentMethod } from '../../models';
import { paymentMethodModelToType } from '../../typings';

type FindPaymentMethodOptions = {
  id?: number;
  userId?: number;
  empyrCardIdIsNull?: boolean;
  empyrCardId?: number;
  mask?: string;
  includeSoftDeleted?: boolean;
};

export function generateFindPaymentMethodWhere(options: FindPaymentMethodOptions): WhereOptions {
  const { id, userId, mask, empyrCardId, empyrCardIdIsNull } = options;

  // be more explicit about building a where object based on passed in options rather than using many if statements
  // need to do a !!options since switch statements don't evaluate objects like switch (options)
  switch (!!options) {
    case !!userId && !!empyrCardIdIsNull:
      return {
        userId,
        empyrCardId: {
          [Op.eq]: null,
        },
      };
    case !!userId && (!!empyrCardId || !!mask):
      const or = [];

      if (empyrCardId) {
        or.push({ empyrCardId });
      }

      if (mask) {
        or.push({ mask });
      }
      return {
        userId,
        [Op.or]: or,
      };
    case !!id && !!userId:
      return { id, userId };
    case !!id:
      return { id };
    case !!userId:
      return { userId };
    default:
      return {};
  }
}

export default async function findPaymentMethod(req: Request, res: Response) {
  const { includeSoftDeleted } = req.query;

  const where: WhereOptions = generateFindPaymentMethodWhere(req.query);
  const paranoid = !includeSoftDeleted;

  if (isEmpty(where)) {
    return res.json(null);
  }

  const row = await PaymentMethod.findOne({
    where,
    paranoid,
    include: [BankAccount],
  });

  let response: PaymentMethodLoomis | null = null;
  if (row instanceof PaymentMethod) {
    response = paymentMethodModelToType(row);
  }

  res.json(response);
}
