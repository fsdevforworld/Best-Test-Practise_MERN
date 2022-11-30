import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import {
  Advance,
  DashboardActionLog,
  DashboardAdvanceModification,
  sequelize,
} from '../../../../models';
import { advanceSerializers } from '../../serializers';
import { getParams } from '../../../../lib/utils';
import { ActionCode, validateActionLog } from '../../domain/action-log';

async function unfreezePayback(
  req: IDashboardApiResourceRequest<Advance>,
  res: IDashboardV2Response<advanceSerializers.IAdvanceResource>,
) {
  const internalUserId = req.internalUser.id;
  const advance = req.resource;

  if (!advance.paybackFrozen) {
    return res.sendStatus(204);
  }

  const { dashboardActionReasonId, zendeskTicketUrl, note } = getParams(
    req.body,
    ['dashboardActionReasonId', 'zendeskTicketUrl'],
    ['note'],
  );

  await validateActionLog(dashboardActionReasonId, ActionCode.UnfreezeAdvancePayback, note);

  await sequelize.transaction(async transaction => {
    await advance.update({ paybackFrozen: false }, { transaction });

    const dashboardActionLog = await DashboardActionLog.create(
      {
        dashboardActionReasonId,
        zendeskTicketUrl,
        note,
        internalUserId,
      },
      { transaction },
    );

    const modification = {
      paybackFrozen: {
        previousValue: true,
        currentValue: false,
      },
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

export default unfreezePayback;
