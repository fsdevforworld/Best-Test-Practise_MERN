import { flatten } from 'lodash';
import {
  DashboardActionLog,
  DashboardSubscriptionBillingModification,
  SubscriptionBilling,
} from '../../../../models';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { serializeMany, subscriptionSerializers } from '../../serializers';

async function get(
  req: IDashboardApiResourceRequest<SubscriptionBilling>,
  res: IDashboardV2Response<
    subscriptionSerializers.ISubscriptionBillingResource,
    | subscriptionSerializers.ISubscriptionPaymentResource
    | subscriptionSerializers.ISubscriptionRefundResource
    | subscriptionSerializers.ISubscriptionBillingModificationResource
    | subscriptionSerializers.IActionLogResource
  >,
) {
  const billing = req.resource;
  const [payments, modifications] = await Promise.all([
    billing.getSubscriptionPayments(),
    DashboardSubscriptionBillingModification.findAll({
      where: { subscriptionBillingId: billing.id },
    }),
  ]);
  const nestedRefunds = await Promise.all(
    payments.map(p => p.getReimbursements({ include: [DashboardActionLog] })),
  );
  const refunds = flatten(nestedRefunds);
  const { refundActionLogs, legacyRefunds } = refunds.reduce(
    (prev, refund) => {
      if (refund.dashboardActionLogId) {
        prev.refundActionLogs = [...prev.refundActionLogs, refund.dashboardActionLog];
      } else {
        prev.legacyRefunds = [...prev.legacyRefunds, refund];
      }

      return prev;
    },
    {
      refundActionLogs: [],
      legacyRefunds: [],
    },
  );

  const [
    serializedPayments,
    serializedRefunds,
    serializedModifications,
    serializedActionLogs,
    serializedLegacyRefundActionLogs,
  ] = await Promise.all([
    serializeMany(payments, subscriptionSerializers.serializeSubscriptionPayment),
    serializeMany(refunds, subscriptionSerializers.serializeSubscriptionRefund),
    serializeMany(modifications, subscriptionSerializers.serializeSubscriptionBillingModification),
    serializeMany(refundActionLogs, subscriptionSerializers.serializeActionLog),
    serializeMany(legacyRefunds, subscriptionSerializers.serializeRefundLegacyActionLog),
  ]);

  const included = [
    ...serializedPayments,
    ...serializedRefunds,
    ...serializedModifications,
    ...serializedActionLogs,
    ...serializedLegacyRefundActionLogs,
  ];

  const serializedBilling = await subscriptionSerializers.serializeSubscriptionBilling(billing, {
    subscriptionPayments: serializedPayments,
    subscriptionRefunds: serializedRefunds,
    modifications: serializedModifications,
    actionLogs: [...serializedActionLogs, ...serializedLegacyRefundActionLogs],
  });

  const response = {
    data: serializedBilling,
    included,
  };

  return res.send(response);
}

export default get;
