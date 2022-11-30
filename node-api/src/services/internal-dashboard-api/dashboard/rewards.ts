import { User, PaymentMethod } from '../../../models';
import { NotFoundError } from '../../../lib/error';
import { IDashboardApiRequest } from '../../../typings';
import { Response } from 'express';

// Get rewards information for user
async function getByUserId(req: IDashboardApiRequest, res: Response): Promise<Response> {
  const user = await User.findByPk(req.params.userId, {
    include: [PaymentMethod],
    paranoid: false,
  });

  if (!user) {
    throw new NotFoundError(`User Not Found`);
  }

  const optedInCards = user.paymentMethods
    .filter(paymentMethod => paymentMethod.optedIntoDaveRewards)
    .map(({ expiration, scheme, empyrCardId, mask }) => ({
      expiration,
      scheme,
      empyrCardId,
      mask,
    }));

  return res.send({
    empyrUserId: user.empyrUserId,
    optedInCards,
  });
}

export default {
  getByUserId,
};
