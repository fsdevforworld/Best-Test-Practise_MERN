import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { advanceSerializers } from '../../serializers';
import * as PaymentHelper from '../../../../domain/payment';
import { Payment } from '../../../../models';

async function refresh(
  req: IDashboardApiResourceRequest<Payment>,
  res: IDashboardV2Response<advanceSerializers.IAdvancePaymentResource>,
) {
  const payment = req.resource;

  const refreshedPayment = await PaymentHelper.refreshPayment(payment);

  const data = await advanceSerializers.serializeAdvancePayment(refreshedPayment);

  const response = {
    data,
  };

  res.send(response);
}

export default refresh;
