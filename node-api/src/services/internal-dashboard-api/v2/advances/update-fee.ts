import { BigNumber } from 'bignumber.js';
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

async function updateFee(
  req: IDashboardApiResourceRequest<Advance, ActionLogPayload & { fee: number }>,
  res: IDashboardV2Response<advanceSerializers.IAdvanceResource>,
) {
  const advance = req.resource;
  const internalUserId = req.internalUser.id;

  const { fee: newFee, dashboardActionReasonId, zendeskTicketUrl, note } = getParams(
    req.body,
    ['fee', 'dashboardActionReasonId', 'zendeskTicketUrl'],
    ['note'],
  );

  await validateActionLog(dashboardActionReasonId, ActionCode.AdvanceFeeChange, note);

  await sequelize.transaction(async transaction => {
    const lockedAdvance = await Advance.findByPk(advance.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    const previousFee = lockedAdvance.fee;
    const previousOutstanding = lockedAdvance.outstanding;

    const newOutstanding = new BigNumber(previousOutstanding).plus(newFee).minus(previousFee);

    const modification: IDashboardModification = {
      fee: {
        previousValue: previousFee,
        currentValue: newFee,
      },
      outstanding: {
        previousValue: previousOutstanding,
        currentValue: newOutstanding.toNumber(),
      },
    };

    await lockedAdvance.update(
      {
        fee: newFee,
        outstanding: newOutstanding.toNumber(),
      },
      { transaction },
    );

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

export default updateFee;
