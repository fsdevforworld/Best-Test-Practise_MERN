import { BankingDataSource } from '@dave-inc/wire-typings';
import { InvalidParametersError } from '@dave-inc/error-types';
import {
  BankConnection,
  DashboardActionLog,
  DashboardActionLogBankConnection,
  sequelize,
} from '../../../../models';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { getParams } from '../../../../lib/utils';
import { bankConnectionSerializers } from '../../serializers';
import * as LoomisDomain from '../../../../services/loomis-api/domain/delete-bank-account';
import { ActionCode, ActionLogPayload, validateActionLog } from '../../domain/action-log';

async function archive(
  req: IDashboardApiResourceRequest<BankConnection, ActionLogPayload>,
  res: IDashboardV2Response<bankConnectionSerializers.IBankConnectionResource>,
) {
  const { internalUser, resource: bankConnection, body } = req;

  if (bankConnection.bankingDataSource === BankingDataSource.BankOfDave) {
    throw new InvalidParametersError('Cannot archive Dave Banking connections');
  }

  const { dashboardActionReasonId, zendeskTicketUrl, note } = getParams(
    body,
    ['dashboardActionReasonId', 'zendeskTicketUrl'],
    ['note'],
  );

  await validateActionLog(dashboardActionReasonId, ActionCode.ArchiveBankConnection, note);

  await sequelize.transaction(async transaction => {
    const dashboardActionLog = await DashboardActionLog.create(
      { dashboardActionReasonId, zendeskTicketUrl, note, internalUserId: internalUser.id },
      { transaction },
    );

    await DashboardActionLogBankConnection.create(
      {
        bankConnectionId: bankConnection.id,
        dashboardActionLogId: dashboardActionLog.id,
      },
      { transaction },
    );
  });

  await LoomisDomain.deleteBankConnection(bankConnection, {
    force: false,
    deleteBankingDataSource: true,
    admin: internalUser.id,
    validate: true,
  });

  const data = await bankConnectionSerializers.serializeBankConnection(bankConnection);

  res.send({ data });
}

export default archive;
