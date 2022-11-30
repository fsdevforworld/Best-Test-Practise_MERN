import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import {
  AdvanceApproval,
  BankAccount,
  DashboardActionLog,
  DashboardAdvanceApproval,
  sequelize,
  User,
} from '../../../../models';
import { advanceApprovalSerializers } from '../../serializers';
import { getParams } from '../../../../lib/utils';
import { NotFoundError } from '../../../../lib/error';
import { ActionCode, validateActionLog } from '../../domain/action-log';
import AdvanceApprovalClient from '../../../../lib/advance-approval-client';
import { AdvanceApprovalTrigger } from '../../../advance-approval/types';
import { getTimezone } from '../../../../domain/user-setting';
import { getAdvanceSummary } from '../../../../domain/advance-approval-request';

async function create(
  req: IDashboardApiResourceRequest<AdvanceApproval>,
  res: IDashboardV2Response<advanceApprovalSerializers.IAdvanceApprovalResource>,
) {
  const internalUserId = req.internalUser.id;
  const { userId, bankAccountId, dashboardActionReasonId } = getParams(req.body, [
    'userId',
    'bankAccountId',
    'dashboardActionReasonId',
  ]);
  const user = await User.findByPk(userId);

  if (!user) {
    throw new NotFoundError('User not found');
  }

  const bankAccount = await BankAccount.findByPk(bankAccountId);

  if (!bankAccount) {
    throw new NotFoundError('Bank account not found');
  }

  await validateActionLog(dashboardActionReasonId, ActionCode.RunApproval);

  const [approvalResponse] = await AdvanceApprovalClient.createAdvanceApproval({
    userTimezone: await getTimezone(user.id),
    userId: user.id,
    bankAccountId: bankAccount.id,
    advanceSummary: await getAdvanceSummary(user.id),
    trigger: AdvanceApprovalTrigger.Admin,
    auditLog: true,
  });

  await sequelize.transaction(async transaction => {
    const { id: dashboardActionLogId } = await DashboardActionLog.create(
      {
        internalUserId,
        dashboardActionReasonId,
      },
      { transaction },
    );

    await DashboardAdvanceApproval.create(
      {
        dashboardActionLogId,
        advanceApprovalId: approvalResponse.id,
      },
      { transaction },
    );
  });

  const data = await advanceApprovalSerializers.serializeAdvanceApproval(approvalResponse);

  return res.send({ data });
}

export default create;
