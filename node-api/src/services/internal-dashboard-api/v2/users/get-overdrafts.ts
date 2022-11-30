import { flatten, orderBy } from 'lodash';
import { User } from '../../../../models';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { overdraftSerializers, serializeMany } from '../../serializers';
import { generateClient } from '../../domain/overdraft';

async function getOverdrafts(
  req: IDashboardApiResourceRequest<User>,
  res: IDashboardV2Response<overdraftSerializers.IOverdraftResource[]>,
) {
  const user = req.resource;
  const client = generateClient();

  const {
    data: { account, overdrafts },
    status,
  } = await client.getAccount(user.id);

  if (status === 204) {
    return res.send({ data: [] });
  }

  const data = await serializeMany(overdrafts, overdraftSerializers.serializeOverdraft);
  const sortedData = orderBy(data, 'attributes.created', 'desc');

  const settlements = flatten(overdrafts.map(overdraft => overdraft.settlements));
  const disbursements = flatten(overdrafts.map(overdraft => overdraft.disbursements));

  const [serializedAccount, serializedSettlements, serializedDisbursements] = await Promise.all([
    overdraftSerializers.serializeOverdraftAccount(account, {
      user: { id: `${user.id}`, type: 'user' },
    }),
    serializeMany(settlements, overdraftSerializers.serializeOverdraftSettlement),
    serializeMany(disbursements, overdraftSerializers.serializeOverdraftDisbursement),
  ]);

  const response = {
    data: sortedData,
    included: [serializedAccount, ...serializedSettlements, ...serializedDisbursements],
  };

  return res.send(response);
}

export default getOverdrafts;
