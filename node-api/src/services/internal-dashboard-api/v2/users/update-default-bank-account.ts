import { syncUserDefaultBankAccount } from '../../../../domain/banking-data-sync';
import UserHelper from '../../../../helper/user';
import { getParams } from '../../../../lib/utils';
import { User, sequelize } from '../../../../models';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { ActionCode, ActionLogPayload, validateActionLog } from '../../domain/action-log';
import { update } from '../../domain/user';
import { userSerializers } from '../../serializers';

async function updateDefaultBankAccount(
  req: IDashboardApiResourceRequest<User, { bankAccountId: string } & ActionLogPayload>,
  res: IDashboardV2Response<userSerializers.IUserResource>,
) {
  const internalUserId = req.internalUser.id;

  const { bankAccountId, dashboardActionReasonId } = getParams(req.body, [
    'bankAccountId',
    'dashboardActionReasonId',
  ]);

  const defaultBankAccountId = parseInt(bankAccountId, 10);

  const user = req.resource;

  await Promise.all([
    validateActionLog(dashboardActionReasonId, ActionCode.UpdateDefaultBankAccount),
    UserHelper.validateDefaultBankAccountUpdate(defaultBankAccountId, user),
  ]);

  await sequelize.transaction(async transaction => {
    await update(
      user,
      { defaultBankAccountId },
      {
        dashboardActionReasonId,
        internalUserId,
      },
      { transaction },
    );

    await syncUserDefaultBankAccount(defaultBankAccountId, { transaction });
  });

  const data = await userSerializers.serializeUser(user);

  const response = {
    data,
  };

  return res.send(response);
}

export default updateDefaultBankAccount;
