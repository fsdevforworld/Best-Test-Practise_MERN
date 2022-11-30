import { Response } from 'express';
import { Readable } from 'stream';
import {
  BankAccount,
  DashboardActionLog,
  DashboardActionLogMonthlyStatement,
  sequelize,
} from '../../../../../models';
import { IDashboardApiResourceRequest } from '../../../../../typings';
import getClient from '../../../../../domain/bank-of-dave-internal-api';
import { NotFoundError } from '@dave-inc/error-types';
import { ActionCode, ActionLogPayload, validateActionLog } from '../../../domain/action-log';
import { getParams } from '../../../../../lib/utils';

async function getStatement(bankAccountExternalId: string, statementId: string) {
  const client = getClient();

  try {
    const { data, headers } = await client.getBankAccountStatementStream(
      bankAccountExternalId,
      statementId,
      {
        responseType: 'stream',
      },
    );

    return {
      data: (data as unknown) as Readable,
      headers,
    };
  } catch (ex) {
    if (ex?.response?.status === 404) {
      throw new NotFoundError('Could not find statement');
    }

    throw ex;
  }
}

async function download(
  req: IDashboardApiResourceRequest<BankAccount, ActionLogPayload>,
  res: Response,
) {
  const {
    params: { statementId },
    internalUser,
    resource: { externalId: bankAccountExternalId },
  } = req;

  const { dashboardActionReasonId, zendeskTicketUrl, note } = getParams(
    req.body,
    ['dashboardActionReasonId', 'zendeskTicketUrl'],
    ['note'],
  );

  await validateActionLog(dashboardActionReasonId, ActionCode.DownloadMonthlyStatement, note);

  const { data, headers } = await getStatement(bankAccountExternalId, statementId);

  await sequelize.transaction(async transaction => {
    const dashboardActionLog = await DashboardActionLog.create(
      {
        dashboardActionReasonId,
        internalUserId: internalUser.id,
        zendeskTicketUrl,
        note,
      },
      { transaction },
    );

    await DashboardActionLogMonthlyStatement.create(
      {
        dashboardActionLogId: dashboardActionLog.id,
        statementId,
      },
      { transaction },
    );
  });

  res.set('Content-Type', headers['content-type']);
  res.set('Content-Disposition', headers['content-disposition']);
  res.set('Access-Control-Expose-Headers', 'Content-Disposition');

  data.pipe(res);
}

export default download;
