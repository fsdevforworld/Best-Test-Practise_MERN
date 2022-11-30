import { Response } from 'express';
import { Op } from 'sequelize';
import { IDashboardApiRequest } from '../../../../typings';
import { AuditLog, Role, User } from '../../../../models';
import { getParams, updateAndGetModifications } from '../../../../lib/utils';
import UserHelper from '../../../../helper/user';
import { syncUserDefaultBankAccount } from '../../../../domain/banking-data-sync';

export default async function update(req: IDashboardApiRequest, res: Response): Promise<Response> {
  const adminId = req.internalUser.id;
  const user = await User.findByPk(req.params.id, {
    paranoid: false,
    include: [
      {
        model: Role,
        required: false,
      },
    ],
  });

  const updateableFields = ['allowDuplicateCard', 'roles', 'defaultBankAccountId'];

  const params = getParams(req.body, [], updateableFields);

  if (params.defaultBankAccountId) {
    await UserHelper.validateDefaultBankAccountUpdate(params.defaultBankAccountId, user);
  }

  const modifications = await updateAndGetModifications(user, params);

  await UserHelper.logModifications({
    modifications,
    userId: user.id,
    type: AuditLog.TYPES.USER_PROFILE_UPDATE,
    requestPayload: params,
    extras: { adminId },
  });

  if (params.roles) {
    const roles = await Role.findAll({
      where: {
        name: {
          [Op.in]: params.roles,
        },
      },
    });

    await user.setRoles(roles);
  }

  if (params.defaultBankAccountId) {
    await syncUserDefaultBankAccount(params.defaultBankAccountId);
  }

  if (user.isActive()) {
    await user.reload();
  }

  return res.send(user);
}
