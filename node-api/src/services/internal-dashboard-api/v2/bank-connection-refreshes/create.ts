import { IDashboardApiRequest, IDashboardV2Response } from '../../../../typings';
import { BankConnection, BankConnectionRefresh } from '../../../../models';
import { bankConnectionSerializers } from '../../serializers';
import { InvalidVerificationError, NotFoundError } from '../../../../lib/error';
import { getParams } from '../../../../lib/utils';
import { BankingDataSource } from '@dave-inc/wire-typings';
import * as Jobs from '../../../../jobs/data';

async function create(
  req: IDashboardApiRequest<{ bankConnectionId: number }>,
  res: IDashboardV2Response<bankConnectionSerializers.IBankConnectionRefreshResource>,
) {
  const { bankConnectionId } = getParams(req.body, ['bankConnectionId']);

  const bankConnection = await BankConnection.findByPk(bankConnectionId);

  if (!bankConnection) {
    throw new NotFoundError('Banking connection not found');
  }

  if (bankConnection.bankingDataSource !== BankingDataSource.Plaid) {
    throw new InvalidVerificationError('Must be a plaid banking connection');
  }

  const bankConnectionRefresh = await BankConnectionRefresh.create({ bankConnectionId });

  await bankConnectionRefresh.reload();

  const data = await bankConnectionSerializers.serializeBankConnectionRefresh(
    bankConnectionRefresh,
    {
      'bank-connection': { type: 'bank-connection', id: bankConnection.id.toString() },
    },
  );

  const response = {
    data,
  };

  await Jobs.createInitiateBankConnectionRefresh({
    bankConnectionRefreshId: bankConnectionRefresh.id,
  });

  return res.send(response);
}

export default create;
