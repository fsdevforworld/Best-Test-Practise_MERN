import * as Faker from 'faker';
import { sample } from 'lodash';
import { DashboardAdvanceRepayment } from '../../src/models';

export default function(factory: any) {
  factory.define('dashboard-advance-repayment', DashboardAdvanceRepayment, {
    advanceId: factory.assoc('advance', 'id'),
    dashboardActionLogId: factory.assoc('dashboard-action-log', 'id'),
    tivanTaskId: () => Faker.random.alphaNumeric(32),
    amount: () => Faker.random.number(100),
    paymentMethodUniversalId: () => `${sample(['BANK', 'DEBIT'])}:${Faker.random.number(100)}`,
  });
}
