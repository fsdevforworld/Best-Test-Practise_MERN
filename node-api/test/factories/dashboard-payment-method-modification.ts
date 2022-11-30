import * as Faker from 'faker';
import { DashboardPaymentMethodModification } from '../../src/models';

export default function(factory: any) {
  factory.define('dashboard-payment-method-modification', DashboardPaymentMethodModification, {
    paymentMethodUniversalId: Faker.random.uuid,
    dashboardActionLogId: factory.assoc('dashboard-action-log', 'id'),
  });
}
