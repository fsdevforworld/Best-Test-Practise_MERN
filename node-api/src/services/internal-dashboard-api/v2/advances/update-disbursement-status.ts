import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import {
  Advance,
  DashboardAction,
  DashboardActionLog,
  DashboardAdvanceModification,
  sequelize,
} from '../../../../models';
import { advanceSerializers } from '../../serializers';
import { getParams } from '../../../../lib/utils';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { NotFoundError } from '../../../../lib/error';
import { InvalidParametersError } from '@dave-inc/error-types';
import { ActionCode, ActionLogPayload } from '../../domain/action-log';
import AdvanceHelper from '../../../../helper/advance';

async function updateDisbursementStatus(
  req: IDashboardApiResourceRequest<
    Advance,
    ActionLogPayload & { status: ExternalTransactionStatus }
  >,
  res: IDashboardV2Response<advanceSerializers.IAdvanceResource>,
) {
  const internalUserId = req.internalUser.id;
  const advance = req.resource;

  const { status, zendeskTicketUrl, note } = getParams(
    req.body,
    ['status', 'zendeskTicketUrl'],
    ['note'],
  );

  if (status === advance.disbursementStatus) {
    return res.sendStatus(204);
  }

  const { Canceled, Completed } = ExternalTransactionStatus;

  const isStatusValid = [Canceled, Completed].includes(status);

  if (!isStatusValid) {
    throw new InvalidParametersError(`Status must be either ${Canceled} or ${Completed}`);
  }

  const action = await DashboardAction.scope([
    'withReasons',
    { method: ['forCodes', ActionCode.AdvanceDisbursementStatusChange] },
  ]).findOne();

  const dashboardActionReason = action.dashboardActionReasons.find(
    actionReason => actionReason.reason.toLowerCase() === status.toLowerCase(),
  );

  if (!dashboardActionReason) {
    throw new NotFoundError('Cannot find action reason');
  }

  const { disbursementStatus: previousStatus, outstanding: previousOutstanding } = advance;

  await sequelize.transaction(async transaction => {
    await AdvanceHelper.updateDisbursementStatus(advance, status, {
      transaction,
      sendNotification: false,
    });

    const dashboardActionLog = await DashboardActionLog.create(
      {
        internalUserId,
        dashboardActionReasonId: dashboardActionReason.id,
        zendeskTicketUrl,
        note,
      },
      { transaction },
    );

    const outstandingModification =
      status === Canceled
        ? {
            outstanding: {
              previousValue: previousOutstanding,
              currentValue: 0,
            },
          }
        : {};

    const modification = {
      disbursementStatus: {
        previousValue: previousStatus,
        currentValue: status,
      },
      ...outstandingModification,
    };

    await DashboardAdvanceModification.create(
      {
        modification,
        dashboardActionLogId: dashboardActionLog.id,
        advanceId: advance.id,
      },
      { transaction },
    );
  });

  const data = await advanceSerializers.serializeAdvance(advance);

  return res.send({ data });
}

export default updateDisbursementStatus;
