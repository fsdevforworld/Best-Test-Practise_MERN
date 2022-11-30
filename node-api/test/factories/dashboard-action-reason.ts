import * as Faker from 'faker';
import { DashboardActionReason } from '../../src/models';

export default function(factory: any) {
  factory.define('dashboard-action-reason', DashboardActionReason, {
    dashboardActionId: factory.assoc('dashboard-action', 'id'),
    reason: Faker.hacker.phrase,
  });
}
