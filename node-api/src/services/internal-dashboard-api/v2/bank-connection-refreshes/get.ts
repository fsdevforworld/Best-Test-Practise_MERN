import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { BankConnectionRefresh } from '../../../../models';
import { bankConnectionSerializers } from '../../serializers';

async function get(
  req: IDashboardApiResourceRequest<BankConnectionRefresh>,
  res: IDashboardV2Response<bankConnectionSerializers.IBankConnectionRefreshResource>,
) {
  const bankConnectionRefresh = req.resource;

  const data = await bankConnectionSerializers.serializeBankConnectionRefresh(
    bankConnectionRefresh,
    {
      'bank-connection': {
        type: 'bank-connection',
        id: bankConnectionRefresh.bankConnectionId.toString(),
      },
    },
  );

  const response = {
    data,
  };

  return res.send(response);
}

export default get;
