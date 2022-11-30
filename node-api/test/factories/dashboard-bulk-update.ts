import * as Faker from 'faker';
import { DashboardBulkUpdate } from '../../src/models';

export default function(factory: any) {
  factory.define('dashboard-bulk-update', DashboardBulkUpdate, {
    dashboardActionLogId: factory.assoc('dashboard-action-log', 'id'),
    internalUserId: factory.assoc('internal-user', 'id'),
    name: () => Faker.random.alphaNumeric(),
    inputFileUrl: () => Faker.random.alphaNumeric(),
    outputFileUrl: () => Faker.random.alphaNumeric(),
    inputFileRowCount: () => Faker.random.number(),
    createdAt: () => Faker.date.recent(),
    updatedAt: () => Faker.date.recent(),
    status: 'PENDING',
  });
}
