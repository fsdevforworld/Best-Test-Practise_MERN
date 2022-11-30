import * as Faker from 'faker';
import { sample } from 'lodash';
import { Reimbursement } from '../../src/models';
import { statuses } from '../../src/models/reimbursement';

export default function(factory: any) {
  factory.define('reimbursement', Reimbursement, {
    userId: factory.assoc('user', 'id'),
    reason: () => Faker.lorem.sentence(),
    zendeskTicketId: () => Faker.internet.url(),
    amount: () => Faker.random.number({ min: 0.01, max: 200, precision: 2 }),
    status: () => sample(statuses),
    payableType: 'PAYMENT_METHOD',
  });

  factory.extend('reimbursement', 'card-failed-reimbursement', {
    status: 'FAILED',
    extra: {
      note: () => Faker.lorem.sentence(),
      transactionResult: {
        id: () => Faker.random.uuid(),
        data: {
          EC: '0',
          SC: 200,
          status: 'ERROR',
          gateway: 'TABAPAY',
          network: 'VisaFF',
          networkID: () => Faker.random.uuid(),
          networkRC: 'ZZ',
          transactionID: () => Faker.random.uuid(),
          isSubscription: false,
          processorHttpStatus: 200,
        },
        status: 'FAILED',
        processor: 'TABAPAY',
      },
    },
  });

  factory.extend('reimbursement', 'bank-failed-reimbursement', {
    status: 'FAILED',
    extra: { transactionResult: { data: {}, status: 'FAILED' } },
  });
}
