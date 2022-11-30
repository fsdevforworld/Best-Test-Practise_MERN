import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { ActionCode, ActionLogPayload, validateActionLog } from '../../domain/action-log';
import { advanceSerializers } from '../../serializers';
import { getParams, updateAndGetModifications } from '../../../../lib/utils';
import {
  Advance,
  DashboardActionLog,
  DashboardAdvanceModification,
  sequelize,
} from '../../../../models';

async function freezePayback(
  req: IDashboardApiResourceRequest<Advance, ActionLogPayload>,
  res: IDashboardV2Response<advanceSerializers.IAdvanceResource>,
) {
  const advance = req.resource;
  const internalUserId = req.internalUser.id;

  if (advance.paybackFrozen) {
    return res.sendStatus(204);
  }

  const { dashboardActionReasonId, zendeskTicketUrl, note } = getParams(
    req.body,
    ['dashboardActionReasonId', 'zendeskTicketUrl'],
    ['note'],
  );

  await validateActionLog(dashboardActionReasonId, ActionCode.FreezeAdvancePayback, note);

  await sequelize.transaction(async transaction => {
    const modifications = await updateAndGetModifications(
      advance,
      { paybackFrozen: true },
      { transaction },
    );

    const dashboardActionLog = await DashboardActionLog.create(
      { dashboardActionReasonId, zendeskTicketUrl, note, internalUserId },
      { transaction },
    );

    await DashboardAdvanceModification.create(
      {
        advanceId: advance.id,
        dashboardActionLogId: dashboardActionLog.id,
        modification: modifications,
      },
      { transaction },
    );
  });

  const data = await advanceSerializers.serializeAdvance(advance);

  return res.send({ data });
}

export default freezePayback;
