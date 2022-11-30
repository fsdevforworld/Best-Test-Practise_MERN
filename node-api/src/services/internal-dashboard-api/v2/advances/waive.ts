import {
  Advance,
  DashboardActionLog,
  DashboardAdvanceModification,
  sequelize,
} from '../../../../models';
import { getParams } from '../../../../lib/utils';
import {
  IDashboardApiResourceRequest,
  IDashboardModification,
  IDashboardV2Response,
} from '../../../../typings';
import { ActionCode, ActionLogPayload, validateActionLog } from '../../domain/action-log';
import { advanceSerializers } from '../../serializers';
import { ConflictError } from '@dave-inc/error-types';

async function waive(
  req: IDashboardApiResourceRequest<Advance, ActionLogPayload>,
  res: IDashboardV2Response<advanceSerializers.IAdvanceResource>,
) {
  const advance = req.resource;
  const internalUserId = req.internalUser.id;

  const { dashboardActionReasonId, zendeskTicketUrl, note } = getParams(
    req.body,
    ['dashboardActionReasonId', 'zendeskTicketUrl'],
    ['note'],
  );

  await validateActionLog(dashboardActionReasonId, ActionCode.WaiveAdvanceOutstanding, note);

  await sequelize.transaction(async transaction => {
    const { outstanding: currentOutstanding, paybackFrozen: currentFrozen } = await advance.reload({
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (currentOutstanding <= 0) {
      throw new ConflictError('Advance outstanding must be > 0 to waive', {
        data: {
          advanceId: advance.id,
          currentOutstanding,
        },
      });
    }

    const {
      outstanding: updatedOutstanding,
      paybackFrozen: updatedPaybackFrozen,
    } = await advance.update(
      {
        outstanding: 0,
        paybackFrozen: true,
      },
      { transaction },
    );

    const modification: IDashboardModification = {
      outstanding: {
        previousValue: currentOutstanding,
        currentValue: updatedOutstanding,
      },
    };

    if (currentFrozen !== updatedPaybackFrozen) {
      modification.paybackFrozen = {
        previousValue: currentFrozen,
        currentValue: updatedPaybackFrozen,
      };
    }

    const dashboardActionLog = await DashboardActionLog.create(
      {
        dashboardActionReasonId,
        internalUserId,
        note,
        zendeskTicketUrl,
      },
      { transaction },
    );

    await DashboardAdvanceModification.create(
      {
        advanceId: advance.id,
        dashboardActionLogId: dashboardActionLog.id,
        modification,
      },
      { transaction },
    );
  });

  const data = await advanceSerializers.serializeAdvance(advance);

  res.send({ data });
}

export default waive;
