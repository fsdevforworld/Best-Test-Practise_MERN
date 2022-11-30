import { isNil } from 'lodash';
import { User } from '../../../../models';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { getParams, validateE164 } from '../../../../lib/utils';
import { userSerializers } from '../../serializers';
import { update, UpdatePhoneNumberPayload } from '../../domain/user';
import { ActionCode, ActionLogPayload, validateActionLog } from '../../domain/action-log';
import { ConflictError, InvalidParametersError } from '@dave-inc/error-types';

async function updatePhoneNumber(
  req: IDashboardApiResourceRequest<User, ActionLogPayload & UpdatePhoneNumberPayload>,
  res: IDashboardV2Response<userSerializers.IUserResource>,
) {
  const internalUserId = req.internalUser.id;

  const { phoneNumber, dashboardActionReasonId, zendeskTicketUrl, note } = getParams(
    req.body,
    ['phoneNumber', 'dashboardActionReasonId', 'zendeskTicketUrl'],
    ['note'],
  );

  const user = req.resource;

  const [isValidPhoneNumber, existingUser] = await Promise.all([
    validateE164(phoneNumber.split('-')[0]),
    User.findOneByPhoneNumber(phoneNumber),
    validateActionLog(dashboardActionReasonId, ActionCode.UserPhoneNumberChange, note),
  ]);

  if (!isValidPhoneNumber) {
    throw new InvalidParametersError('Phone number must be a valid E164-formatted US number');
  }

  if (!isNil(existingUser)) {
    throw new ConflictError('A user already exists with that phone number');
  }

  await update(
    user,
    { phoneNumber },
    {
      dashboardActionReasonId,
      internalUserId,
      zendeskTicketUrl,
      note,
    },
  );

  const data = await userSerializers.serializeUser(user);

  const response = {
    data,
  };

  return res.send(response);
}

export default updatePhoneNumber;
