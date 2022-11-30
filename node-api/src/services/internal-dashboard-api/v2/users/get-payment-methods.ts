import { orderBy } from 'lodash';
import { User } from '../../../../models';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { paymentMethodSerializers, serializeMany } from '../../serializers';
import { getAllForUser } from '../../domain/payment-method';

async function getPaymentMethods(
  req: IDashboardApiResourceRequest<User>,
  res: IDashboardV2Response<paymentMethodSerializers.IPaymentMethodResource[]>,
) {
  const user = req.resource;

  const paymentMethods = await getAllForUser(user.id);

  const data = await serializeMany(paymentMethods, paymentMethodSerializers.serializePaymentMethod);
  const sortedData = orderBy(data, 'attributes.created', 'desc');

  const response = {
    data: sortedData,
  };

  return res.send(response);
}

export default getPaymentMethods;
