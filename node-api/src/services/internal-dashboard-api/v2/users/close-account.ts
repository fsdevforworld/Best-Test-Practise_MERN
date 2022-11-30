import {
  DashboardActionLog,
  DashboardActionLogDeleteRequest,
  sequelize,
  SynapsepayDocument,
  User,
} from '../../../../models';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { getParams } from '../../../../lib/utils';
import { serializeMany, synapsepaySerializers, userSerializers } from '../../serializers';
import { AccountManagement } from '../../../../domain/account-management';
import { ActionCode, ActionLogPayload, validateActionLog } from '../../domain/action-log';

async function closeAccount(
  req: IDashboardApiResourceRequest<User, ActionLogPayload & { waiveCoolOff: boolean }>,
  res: IDashboardV2Response<
    userSerializers.IUserResource,
    synapsepaySerializers.ISynapsepayDocumentResource
  >,
) {
  const internalUserId = req.internalUser.id;

  const { waiveCoolOff, ...actionLogParams } = getParams(
    req.body,
    ['waiveCoolOff', 'dashboardActionReasonId', 'zendeskTicketUrl'],
    ['note'],
  );

  const user = req.resource;

  const { dashboardActionReason } = await validateActionLog(
    actionLogParams.dashboardActionReasonId,
    ActionCode.CloseAccount,
    actionLogParams.note,
  );

  const removalResult = await AccountManagement.removeUserAccountById({
    userId: user.id,
    reason: dashboardActionReason.reason,
    options: {
      shouldOverrideSixtyDayDelete: Boolean(waiveCoolOff),
    },
  });

  const deleteRequestId = removalResult.result.id;

  await sequelize.transaction(async transaction => {
    const dashboardActionLog = await DashboardActionLog.create(
      {
        ...actionLogParams,
        internalUserId,
      },
      { transaction },
    );

    await DashboardActionLogDeleteRequest.create(
      {
        dashboardActionLogId: dashboardActionLog.id,
        deleteRequestId,
      },
      { transaction },
    );
  });

  const synapsepayDocuments = await SynapsepayDocument.findAll({
    where: { userId: user.id },
    paranoid: false,
  });

  const serializedSynapsepayDocuments = await serializeMany(
    synapsepayDocuments,
    synapsepaySerializers.serializeSynapsepayDocument,
  );
  const data = await userSerializers.serializeUser(user, {
    synapsepayDocuments: serializedSynapsepayDocuments,
  });

  const response = {
    data,
    included: [...serializedSynapsepayDocuments],
  };

  return res.send(response);
}

export default closeAccount;
