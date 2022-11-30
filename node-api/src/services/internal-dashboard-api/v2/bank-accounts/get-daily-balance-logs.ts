import { moment } from '@dave-inc/time-lib';
import { InvalidParametersError } from '@dave-inc/error-types';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { BankAccount } from '../../../../models';
import { bankAccountSerializers, serializeMany } from '../../serializers';
import heathClient from '../../../../lib/heath-client';
import { getParams } from '../../../../lib/utils';

async function getDailyBalanceLogs(
  req: IDashboardApiResourceRequest<BankAccount>,
  res: IDashboardV2Response<bankAccountSerializers.IDailyBalanceLogResource[]>,
) {
  const { resource: bankAccount, query } = req;

  const { startDate, endDate } = getParams(query, ['startDate', 'endDate']);

  const startTime = moment(startDate);
  const endTime = moment(endDate);

  if (!startTime.isSameOrBefore(endTime)) {
    throw new InvalidParametersError('Start date must be the same or before end date');
  }

  // this fails locally (dev env) due to heath dependency issue - https://demoforthedaves.atlassian.net/browse/CI-1208
  const balanceLogs = await heathClient.getBalanceLogs(bankAccount.id, {
    start: startTime,
    end: endTime,
  });

  const data = await serializeMany(balanceLogs, bankAccountSerializers.serializeDailyBalanceLog, {
    'bank-account': { type: 'bank-account', id: bankAccount.id.toString() },
  });

  res.send({
    data,
  });
}

export default getDailyBalanceLogs;
