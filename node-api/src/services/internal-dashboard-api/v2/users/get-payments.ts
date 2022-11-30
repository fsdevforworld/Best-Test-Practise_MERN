import { orderBy } from 'lodash';
import { User } from '../../../../models';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { advanceSerializers, serializeMany } from '../../serializers';

async function getPayments(
  req: IDashboardApiResourceRequest<User>,
  res: IDashboardV2Response<advanceSerializers.IAdvancePaymentResource[]>,
) {
  const user = req.resource;

  const payments = await user.getPayments({ paranoid: false });

  const data = await serializeMany(payments, advanceSerializers.serializeAdvancePayment);
  const sortedData = orderBy(data, 'attributes.created', 'desc');

  const response = {
    data: sortedData,
  };

  return res.send(response);
}

export default getPayments;
