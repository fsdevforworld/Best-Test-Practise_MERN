import { moment } from '@dave-inc/time-lib';
import { getParams } from '../../../../lib/utils';
import {
  Advance,
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

async function updatePaybackDate(
  req: IDashboardApiResourceRequest<Advance, ActionLogPayload & { paybackDate: string }>,
  res: IDashboardV2Response<advanceSerializers.IAdvanceResource>,
) {
  const advance = req.resource;
  const internalUserId = req.internalUser.id;

  const { paybackDate, dashboardActionReasonId, zendeskTicketUrl, note } = getParams(
    req.body,
    ['paybackDate', 'dashboardActionReasonId', 'zendeskTicketUrl'],
    ['note'],
  );

  await validateActionLog(dashboardActionReasonId, ActionCode.AdvancePaybackDateChange, note);

  await sequelize.transaction(async transaction => {
    const previousPaybackDate = advance.paybackDate;
    const paybackDateMoment = moment(paybackDate);

    const modification: IDashboardModification = {
      paybackDate: {
        previousValue: previousPaybackDate.format('YYYY-MM-DD'),
        currentValue: paybackDateMoment.format('YYYY-MM-DD'), // Advance model only stores date part of moment
      },
    };

    const [, dashboardActionLog] = await Promise.all([
      advance.update({ paybackDate: paybackDateMoment }, { transaction }),
      DashboardActionLog.create(
        {
          dashboardActionReasonId,
          internalUserId,
          note,
          zendeskTicketUrl,
        },
        { transaction },
      ),
    ]);

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

  return res.send({ data });
}

export default updatePaybackDate;
