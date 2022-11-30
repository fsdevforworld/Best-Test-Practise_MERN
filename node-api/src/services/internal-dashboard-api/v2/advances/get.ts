import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import {
  Advance,
  AdvanceRefund,
  AdvanceRefundLineItem,
  DashboardActionLog,
  InternalUser,
  Payment,
  Reimbursement,
} from '../../../../models';
import { advanceSerializers, serializeMany } from '../../serializers';
import { flatten } from 'lodash';
import { Op } from 'sequelize';

type Included =
  | advanceSerializers.IAdvancePaymentResource
  | advanceSerializers.IAdvanceRefundResource
  | advanceSerializers.IAdvanceRefundLineItemResource;

async function get(
  req: IDashboardApiResourceRequest<Advance>,
  res: IDashboardV2Response<advanceSerializers.IAdvanceResource, Included>,
) {
  const advance = req.resource;

  const [payments, advanceRefunds] = await Promise.all([
    Payment.findAll({ where: { advanceId: advance.id }, paranoid: false }),
    AdvanceRefund.findAll({
      where: { advanceId: advance.id },
      include: [{ model: Reimbursement, include: [DashboardActionLog] }, AdvanceRefundLineItem],
    }),
  ]);

  const reimbursementIds = advanceRefunds.map(refund => refund.reimbursementId);

  const legacyReimbursements = await Reimbursement.findAll({
    where: {
      advanceId: advance.id,
      id: {
        [Op.notIn]: reimbursementIds,
      },
    },
    include: [InternalUser],
  });

  const refundLineItems = flatten(advanceRefunds.map(refund => refund.advanceRefundLineItems));

  const [
    serializedPayments,
    serializedRefunds,
    serializedLegacyRefunds,
    serializedRefundLineItems,
  ] = await Promise.all([
    serializeMany(payments, advanceSerializers.serializeAdvancePayment),
    serializeMany(advanceRefunds, advanceSerializers.serializeAdvanceRefund),
    serializeMany(legacyReimbursements, advanceSerializers.serializeLegacyAdvanceRefund),
    serializeMany(refundLineItems, advanceSerializers.serializeAdvanceRefundLineItem),
  ]);

  const included = [
    ...serializedPayments,
    ...serializedRefunds,
    ...serializedLegacyRefunds,
    ...serializedRefundLineItems,
  ];

  const data = await advanceSerializers.serializeAdvance(advance, {
    advancePayments: serializedPayments,
    advanceRefunds: [...serializedRefunds, ...serializedLegacyRefunds],
    advanceRefundLineItems: serializedRefundLineItems,
    chosenAdvanceApproval: advance.chosenAdvanceApprovalId
      ? { type: 'advance-approval', id: advance.chosenAdvanceApprovalId?.toString() }
      : null,
  });

  const response = {
    data,
    included,
  };

  return res.send(response);
}

export default get;
