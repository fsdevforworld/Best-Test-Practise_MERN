import * as Faker from 'faker';
import { DashboardActionLog } from '../../src/models';

export default function(factory: any) {
  factory.define('dashboard-action-log', DashboardActionLog, {
    dashboardActionReasonId: factory.assoc('dashboard-action-reason', 'id'),
    internalUserId: factory.assoc('internal-user', 'id'),
    note: Faker.lorem.sentence,
    zendeskTicketUrl: Faker.internet.url,
  });
}
