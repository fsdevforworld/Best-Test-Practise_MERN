import { User } from '../../../../models';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { getParams } from '../../../../lib/utils';
import { validateBirthdate } from '../../../../domain/user-updates';
import { userSerializers } from '../../serializers';
import { moment } from '@dave-inc/time-lib';
import { update } from '../../domain/user';
import { ActionCode, ActionLogPayload, validateActionLog } from '../../domain/action-log';

async function updateBirthdate(
  req: IDashboardApiResourceRequest<
    User,
    ActionLogPayload & {
      birthdate: string;
    }
  >,
  res: IDashboardV2Response<userSerializers.IUserResource>,
) {
  const internalUserId = req.internalUser.id;

  const { birthdate, dashboardActionReasonId, zendeskTicketUrl, note } = getParams(
    req.body,
    ['birthdate', 'dashboardActionReasonId', 'zendeskTicketUrl'],
    ['note'],
  );

  const user = req.resource;
  const birthdateMoment = moment(birthdate);

  await Promise.all([
    validateActionLog(dashboardActionReasonId, ActionCode.UserBirthdateChange, note),
    validateBirthdate(birthdateMoment),
  ]);

  await update(
    user,
    { birthdate: birthdateMoment },
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

export default updateBirthdate;
