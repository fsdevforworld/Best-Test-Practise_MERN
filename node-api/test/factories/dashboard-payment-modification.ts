import { DashboardPaymentModification } from '../../src/models';

export default function(factory: any) {
  factory.define('dashboard-payment-modification', DashboardPaymentModification, {
    paymentId: factory.assoc('payment', 'id'),
    dashboardActionLogId: factory.assoc('dashboard-action-log', 'id'),
    modification: {
      columnName: {
        previousValue: 'previousValue',
        currentValue: 'currentValue',
      },
    },
  });
}
