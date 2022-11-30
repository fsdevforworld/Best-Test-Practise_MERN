import { IDashboardApiRequest, IDashboardV2Response } from '../../../../typings';
import { Advance } from '../../../../models';
import { advanceSerializers } from '../../serializers';
import { getParams } from '../../../../lib/utils';
import { InvalidParametersError, NotFoundError } from '../../../../lib/error';
import { get as getPaymentMethod } from '../../domain/payment-method';
import { ActionCode, ActionLogPayload, validateActionLog } from '../../domain/action-log';
import { create as createAdvanceRepayment } from '../../domain/advance-repayment';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';

type RequestPayload = {
  paymentMethodUniversalId: string;
  amount: number;
} & ActionLogPayload;

async function create(
  req: IDashboardApiRequest<RequestPayload>,
  res: IDashboardV2Response<advanceSerializers.IDashboardAdvanceRepaymentResource>,
) {
  const internalUserId = req.internalUser.id;

  const {
    advanceId,
    paymentMethodUniversalId,
    amount,
    dashboardActionReasonId,
    zendeskTicketUrl,
    note,
  } = getParams(
    req.body,
    [
      'advanceId',
      'amount',
      'paymentMethodUniversalId',
      'dashboardActionReasonId',
      'zendeskTicketUrl',
    ],
    ['note'],
  );

  const [advance] = await Promise.all([
    Advance.findByPk(advanceId),
    validateActionLog(dashboardActionReasonId, ActionCode.CreateAdvanceRepayment, note),
  ]);

  if (!advance) {
    throw new NotFoundError(`Can't find advance`, {
      data: { advanceId },
    });
  }

  if (advance.outstanding < amount) {
    throw new InvalidParametersError(`Repayment amount must be less than outstanding balance`);
  }

  if (advance.disbursementStatus !== ExternalTransactionStatus.Completed) {
    throw new InvalidParametersError(
      `Advance must have disburesment status of ${ExternalTransactionStatus.Completed}`,
      {
        data: {
          disbursementStatus: advance.disbursementStatus,
        },
      },
    );
  }

  const paymentMethod = await getPaymentMethod(paymentMethodUniversalId);
  if (!paymentMethod || paymentMethod.userId !== advance.userId) {
    throw new NotFoundError(`Can't find payment method`, {
      data: {
        paymentMethodUniversalId,
      },
    });
  }

  const advanceRepayment = await createAdvanceRepayment({
    advance,
    paymentMethodUniversalId,
    amount,
    actionLog: {
      internalUserId,
      dashboardActionReasonId,
      zendeskTicketUrl,
      note,
    },
  });

  const data = await advanceSerializers.serializeDashboardAdvanceRepayment(advanceRepayment);

  res.send({ data });
}

export default create;
