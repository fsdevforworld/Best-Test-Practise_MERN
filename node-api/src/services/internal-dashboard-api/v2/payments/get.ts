import {
  IDashboardApiResourceRequest,
  IDashboardV2Response,
  IRawRelationships,
} from '../../../../typings';
import { DashboardAdvanceRepayment, Payment } from '../../../../models';
import {
  advanceSerializers,
  paymentMethodSerializers,
  dashboardActionSerializers,
} from '../../serializers';
import { get as getPaymentMethod } from '../../domain/payment-method';

type Response = IDashboardV2Response<
  advanceSerializers.IAdvancePaymentResource,
  | paymentMethodSerializers.IPaymentMethodResource
  | dashboardActionSerializers.IDashboardActionLogResource
>;

async function serializePaymentMethod(
  payment: Payment,
): Promise<paymentMethodSerializers.IPaymentMethodResource> {
  const paymentMethodId = paymentMethodSerializers.serializeUniversalId(payment);
  if (!paymentMethodId) {
    return null;
  }

  const paymentMethod = await getPaymentMethod(paymentMethodId);

  if (!paymentMethod) {
    return null;
  }

  return paymentMethodSerializers.serializePaymentMethod(paymentMethod);
}

async function serializeActionLog(
  payment: Payment,
): Promise<dashboardActionSerializers.IDashboardActionLogResource> {
  const dashboardPayment = await payment.getDashboardPayment({
    include: [DashboardAdvanceRepayment.scope('withDashboardAction')],
  });

  if (!dashboardPayment) {
    return null;
  }

  const actionLog = dashboardPayment.dashboardAdvanceRepayment.dashboardActionLog;

  return dashboardActionSerializers.serializeDashboardActionLog(actionLog);
}

async function get(req: IDashboardApiResourceRequest<Payment>, res: Response) {
  const { resource: payment } = req;
  const included = [];
  const relationships: IRawRelationships = {};

  const [serializedPaymentMethod, serializedActionLog] = await Promise.all([
    serializePaymentMethod(payment),
    serializeActionLog(payment),
  ]);

  if (serializedPaymentMethod) {
    included.push(serializedPaymentMethod);
    relationships.source = serializedPaymentMethod;
  }

  if (serializedActionLog) {
    included.push(serializedActionLog);
    relationships.dashboardActionLog = serializedActionLog;
  }

  const data = await advanceSerializers.serializeAdvancePayment(payment, relationships);

  res.send({ data, included });
}

export default get;
