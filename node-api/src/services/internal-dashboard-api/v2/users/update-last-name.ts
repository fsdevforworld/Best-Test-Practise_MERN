import { User } from '../../../../models';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { getParams } from '../../../../lib/utils';
import { validateLastName } from '../../../../domain/user-updates';
import { userSerializers } from '../../serializers';
import { update, UpdateLastNamePayload } from '../../domain/user';
import { ActionCode, ActionLogPayload, validateActionLog } from '../../domain/action-log';

async function updateLastName(
  req: IDashboardApiResourceRequest<User, ActionLogPayload & UpdateLastNamePayload>,
  res: IDashboardV2Response<userSerializers.IUserResource>,
) {
  const internalUserId = req.internalUser.id;

  const { lastName, dashboardActionReasonId, zendeskTicketUrl, note } = getParams(
    req.body,
    ['lastName', 'dashboardActionReasonId', 'zendeskTicketUrl'],
    ['note'],
  );

  const user = req.resource;

  await Promise.all([
    validateActionLog(dashboardActionReasonId, ActionCode.UserLastNameChange, note),
    validateLastName(user, lastName),
  ]);

  await update(
    user,
    { lastName },
    {
      dashboardActionReasonId,
      internalUserId,
      zendeskTicketUrl,
      note,
    },
  );

  const serializedUser = await userSerializers.serializeUser(user);

  const response = {
    data: serializedUser,
  };

  return res.send(response);
}

export default updateLastName;
