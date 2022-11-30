import { isNil } from 'lodash';
import {
  AdvanceDelivery,
  ExternalTransactionStatus,
  StandardResponse,
} from '@dave-inc/wire-typings';
import { Op } from 'sequelize';

import { moment } from '@dave-inc/time-lib';

import { Advance, AdvanceCollectionAttempt, Payment } from '../../models';
import { IDaveResourceRequest, IDaveResponse } from '../../typings';
import { COMPLIANCE_EXEMPT_TRIGGERS } from '../../domain/advance-collection-engine/rules';
import * as CollectionDomain from '../../domain/collection';
import { isActiveCollection } from '../../domain/active-collection';

export async function getAdvance(
  req: IDaveResourceRequest<Advance>,
  res: IDaveResponse<StandardResponse>,
) {
  // do not trust the de-normalized 'outstanding' field without refreshing the more-normalized payment data
  // node-api collections can do this validation after-the-fact and retry, but Tivan should
  // try to get the correct data first to minmize the amount of failed `Tasks` in spanner
  // and minimize the number of new balance refreshes against our rate-limited node-api endpoint
  await CollectionDomain.updateOutstanding(req.resource);

  const advance = await Advance.findByPk(req.resource.id);
  const {
    id,
    userId,
    disbursementStatus,
    deleted,
    outstanding,
    paymentMethodId,
    bankAccountId,
  } = advance;

  const activeCollectionAttempt = await AdvanceCollectionAttempt.findOne({
    where: { advanceId: id, processing: true },
  });

  const nonExemptPaymentCount = await AdvanceCollectionAttempt.count({
    include: [
      {
        model: Payment,
        required: true,
        where: {
          status: {
            [Op.in]: [ExternalTransactionStatus.Completed, ExternalTransactionStatus.Pending],
          },
        },
      },
    ],
    where: {
      advanceId: id,
      paymentId: { [Op.ne]: null },
      trigger: {
        [Op.notIn]: COMPLIANCE_EXEMPT_TRIGGERS,
      },
    },
  });

  const isLinkedCard =
    !(
      isNil(advance.disbursementBankTransactionId) && isNil(advance.disbursementBankTransactionUuid)
    ) && advance.delivery === AdvanceDelivery.Express;

  const isActive = await isActiveCollection(`${userId}`, `${id}`);

  const advanceResponse = {
    id,
    userId,
    currentlyCollecting: !!activeCollectionAttempt,
    disbursementStatus,
    retrieveFullOutstanding: nonExemptPaymentCount === 3,
    tooManyNonExemptPayments: nonExemptPaymentCount >= 4,
    deleted: moment(deleted) <= moment(),
    outstanding,
    bankAccountId,
    paymentMethodId,
    isLinkedCard,
    isActiveCollection: isActive,
  };

  const serializedResponse = {
    ok: true,
    advance: advanceResponse,
  };

  return res.send(serializedResponse);
}
