import { User } from '../../../../models';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { getParams } from '../../../../lib/utils';
import { userSerializers } from '../../serializers';
import { ActionCode, ActionLogPayload, validateActionLog } from '../../domain/action-log';
import { update, UpdateAddressPayload } from '../../domain/user';

async function updateAddress(
  req: IDashboardApiResourceRequest<User, ActionLogPayload & UpdateAddressPayload>,
  res: IDashboardV2Response<userSerializers.IUserResource>,
) {
  const internalUserId = req.internalUser.id;

  const {
    addressLine1,
    addressLine2,
    city,
    dashboardActionReasonId,
    state,
    zendeskTicketUrl,
    note,
    zipCode,
  } = getParams(
    req.body,
    ['addressLine1', 'city', 'dashboardActionReasonId', 'state', 'zendeskTicketUrl', 'zipCode'],
    ['addressLine2', 'note'],
  );

  const user = req.resource;

  await validateActionLog(dashboardActionReasonId, ActionCode.UserAddressChange, note);

  await update(
    user,
    { addressLine1, addressLine2, city, state, zipCode },
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

export default updateAddress;
