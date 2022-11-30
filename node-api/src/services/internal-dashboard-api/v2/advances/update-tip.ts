import { setTipAmount } from '../../../../domain/advance-tip';
import { getParams } from '../../../../lib/utils';
import {
  Advance,
  AdvanceTip,
  DashboardActionLog,
  DashboardAdvanceModification,
  sequelize,
} from '../../../../models';
import {
  IDashboardApiResourceRequest,
  IDashboardModification,
  IDashboardV2Response,
} from '../../../../typings';
import { ActionCode, ActionLogPayload, validateActionLog } from '../../domain/action-log';
import { advanceSerializers } from '../../serializers';

async function updateTip(
  req: IDashboardApiResourceRequest<Advance, ActionLogPayload & { amount: number }>,
  res: IDashboardV2Response<advanceSerializers.IAdvanceResource>,
) {
  const advance = req.resource;
  const internalUserId = req.internalUser.id;

  const { amount: newTipAmount, dashboardActionReasonId, zendeskTicketUrl, note } = getParams(
    req.body,
    ['amount', 'dashboardActionReasonId', 'zendeskTicketUrl'],
    ['note'],
  );

  await validateActionLog(dashboardActionReasonId, ActionCode.AdvanceTipChange, note);

  await sequelize.transaction(async transaction => {
    const { tipAmount, tipPercent, outstanding } = await setTipAmount(
      advance,
      newTipAmount,
      'admin',
      {
        analyticsData: { userId: advance.userId },
        transaction,
      },
    );

    const modification: IDashboardModification = {
      tipAmount: {
        previousValue: tipAmount.previous,
        currentValue: tipAmount.current,
      },
      tipPercent: {
        previousValue: tipPercent.previous,
        currentValue: tipPercent.current,
      },
      outstanding: {
        previousValue: outstanding.previous,
        currentValue: outstanding.current,
      },
    };

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

  const updatedAdvance = await advance.reload({ include: [AdvanceTip] });
  const data = await advanceSerializers.serializeAdvance(updatedAdvance);

  return res.send({ data });
}

export default updateTip;
