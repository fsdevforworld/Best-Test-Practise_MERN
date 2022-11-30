import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { InvalidParametersError, NotFoundError } from '../../../../lib/error';
import { getParams } from '../../../../lib/utils';
import {
  DashboardAction,
  DashboardActionLog,
  DashboardAdvanceModification,
  DashboardPaymentModification,
  Payment,
  sequelize,
} from '../../../../models';
import {
  IDashboardApiResourceRequest,
  IDashboardModification,
  IDashboardV2Response,
} from '../../../../typings';
import * as PaymentDomain from '../../../../domain/payment';
import { ActionCode, ActionLogPayload } from '../../domain/action-log';
import { advanceSerializers } from '../../serializers';
import { serializeDate } from '../../../../serialization';

type Payload = Pick<ActionLogPayload, 'zendeskTicketUrl' | 'note'> & {
  status: ExternalTransactionStatus;
};

async function updateStatus(
  req: IDashboardApiResourceRequest<Payment, Payload>,
  res: IDashboardV2Response<advanceSerializers.IAdvancePaymentResource>,
) {
  const internalUserId = req.internalUser.id;
  const payment = req.resource;
  const advance = await payment.getAdvance();

  const { status, zendeskTicketUrl, note } = getParams(
    req.body,
    ['status', 'zendeskTicketUrl'],
    ['note'],
  );

  if (status === payment.status) {
    return res.sendStatus(204);
  }

  const { Canceled, Completed } = ExternalTransactionStatus;

  const isStatusValid = [Canceled, Completed].includes(status);

  if (!isStatusValid) {
    throw new InvalidParametersError(`Status must be either ${Canceled} or ${Completed}`);
  }

  const action = await DashboardAction.scope([
    'withReasons',
    { method: ['forCodes', ActionCode.AdvancePaymentStatusChange] },
  ]).findOne();

  const dashboardActionReason = action.dashboardActionReasons.find(
    actionReason => actionReason.reason.toLowerCase() === status.toLowerCase(),
  );

  if (!dashboardActionReason) {
    throw new NotFoundError('Cannot find action reason');
  }

  const { status: previousStatus, deleted } = payment;
  const previousDeleted = serializeDate(deleted);
  const { id: advanceId, outstanding: previousOutstanding } = advance;

  // Ideally this would be a part of the txn, but the helper is complex and permeating the txn to all the db queries would not be worth it.
  await PaymentDomain.updatePayment(payment, { status });

  await advance.reload();

  await sequelize.transaction(async transaction => {
    const dashboardActionLog = await DashboardActionLog.create(
      {
        internalUserId,
        dashboardActionReasonId: dashboardActionReason.id,
        zendeskTicketUrl,
        note,
      },
      { transaction },
    );

    const hasOutstandingChanged = previousOutstanding !== advance.outstanding;
    if (hasOutstandingChanged) {
      const outstandingModification = {
        outstanding: {
          previousValue: previousOutstanding,
          currentValue: advance.outstanding,
        },
      };

      await DashboardAdvanceModification.create(
        {
          modification: outstandingModification,
          dashboardActionLogId: dashboardActionLog.id,
          advanceId,
        },
        { transaction },
      );
    }

    const modification: IDashboardModification = {
      status: {
        previousValue: previousStatus,
        currentValue: status,
      },
    };

    const currentDeleted = serializeDate(payment.deleted);
    const hasDeletedChanged = previousDeleted !== currentDeleted;
    if (hasDeletedChanged) {
      modification.deleted = {
        previousValue: previousDeleted,
        currentValue: currentDeleted,
      };
    }

    await DashboardPaymentModification.create(
      {
        modification,
        dashboardActionLogId: dashboardActionLog.id,
        paymentId: payment.id,
      },
      { transaction },
    );
  });

  const serializedAdvance = await advanceSerializers.serializeAdvance(advance);
  const data = await advanceSerializers.serializeAdvancePayment(payment);

  return res.send({ data, included: [serializedAdvance] });
}

export default updateStatus;
