import { DashboardPayment } from '../../src/models';

export default function(factory: any) {
  factory.define('dashboard-payment', DashboardPayment, {
    tivanTaskId: factory.assoc('dashboard-advance-repayment', 'tivanTaskId'),
    tivanReferenceId: factory.assoc('payment', 'referenceId'),
  });
}
