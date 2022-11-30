import { User } from '../../../../models';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { getParams } from '../../../../lib/utils';
import { validateFirstName } from '../../../../domain/user-updates';
import { userSerializers } from '../../serializers';
import { update, UpdateFirstNamePayload } from '../../domain/user';
import { ActionCode, ActionLogPayload, validateActionLog } from '../../domain/action-log';

async function updateFirstName(
  req: IDashboardApiResourceRequest<User, ActionLogPayload & UpdateFirstNamePayload>,
  res: IDashboardV2Response<userSerializers.IUserResource>,
) {
  const internalUserId = req.internalUser.id;

  const { firstName, dashboardActionReasonId, zendeskTicketUrl, note } = getParams(
    req.body,
    ['firstName', 'dashboardActionReasonId', 'zendeskTicketUrl'],
    ['note'],
  );

  const user = req.resource;

  await Promise.all([
    validateActionLog(dashboardActionReasonId, ActionCode.UserFirstNameChange, note),
    validateFirstName(user, firstName),
  ]);

  await update(
    user,
    { firstName },
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

export default updateFirstName;
