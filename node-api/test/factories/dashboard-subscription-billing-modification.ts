import { DashboardSubscriptionBillingModification } from '../../src/models';

export default function(factory: any) {
  factory.define(
    'dashboard-subscription-billing-modification',
    DashboardSubscriptionBillingModification,
    {
      subscriptionBillingId: factory.assoc('subscription-billing', 'id'),
      dashboardActionLogId: factory.assoc('dashboard-action-log', 'id'),
      modification: {
        columnName: {
          previousValue: 'previousValue',
          currentValue: 'currentValue',
        },
      },
    },
  );
}
