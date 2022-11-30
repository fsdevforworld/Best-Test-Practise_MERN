import {
  DashboardActionLog,
  DashboardActionLogMembershipPause,
  sequelize,
  User,
} from '../../../../models';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { getParams } from '../../../../lib/utils';
import { userSerializers } from '../../serializers';
import { pause } from '../../../../domain/membership';
import { InvalidParametersError } from '@dave-inc/error-types';
import { ActionCode, ActionLogPayload, validateActionLog } from '../../domain/action-log';

async function pauseAccount(
  req: IDashboardApiResourceRequest<User, ActionLogPayload>,
  res: IDashboardV2Response<userSerializers.IUserResource>,
) {
  const internalUserId = req.internalUser.id;

  const { dashboardActionReasonId, zendeskTicketUrl, note } = getParams(
    req.body,
    ['dashboardActionReasonId', 'zendeskTicketUrl'],
    ['note'],
  );

  const user = req.resource;

  await validateActionLog(dashboardActionReasonId, ActionCode.PauseAccount, note);

  const { success, msg, membershipPause, interpolations } = await pause(user);

  if (!success) {
    throw new InvalidParametersError(msg, { interpolations });
  }

  await sequelize.transaction(async transaction => {
    const dashboardActionLog = await DashboardActionLog.create(
      {
        internalUserId,
        dashboardActionReasonId,
        zendeskTicketUrl,
        note,
      },
      { transaction },
    );

    await DashboardActionLogMembershipPause.create(
      {
        dashboardActionLogId: dashboardActionLog.id,
        membershipPauseId: membershipPause.id,
      },
      { transaction },
    );
  });

  const data = await userSerializers.serializeUser(user);

  const response = {
    data,
  };

  return res.send(response);
}

export default pauseAccount;
