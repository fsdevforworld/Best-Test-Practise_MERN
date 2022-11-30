import * as Faker from 'faker';
import { EmpyrEvent } from '../../src/models';

export default function(factory: any) {
  factory.define('empyr-event', EmpyrEvent, {
    // Don't forget to leave off the second arg 'id' or you'll get an infinite loop
    userId: factory.assoc('user', 'id'),
    paymentMethodId: factory.assoc('payment-method', 'id'),
    transactionId: () => Faker.random.number(),
    cardId: () => Faker.random.number(),
    eventType: 'AUTHORIZED',
    clearedAmount: () => Faker.finance.amount(),
    authorizedAmount: () => Faker.finance.amount(),
    rewardAmount: () => Faker.finance.amount(),
    transactionDate: () => Faker.date.recent(),
    processedDate: () => Faker.date.recent(),
  });

  factory.extend('empyr-event', 'empyr-event-authorized', {
    clearedAmount: null,
  });

  factory.extend('empyr-event', 'empyr-event-cleared', {
    authorizedAmount: null,
    eventType: 'CLEARED',
  });

  factory.extend('empyr-event', 'empyr-event-removed', {
    clearedAmount: null,
    eventType: 'REMOVED',
  });

  factory.extend('empyr-event', 'empyr-event-removed-dup', {
    clearedAmount: 0,
    eventType: 'REMOVED_DUP',
    rewardAmount: 0,
  });
}
