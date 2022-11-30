import * as Faker from 'faker';
import { RewardsLedger } from '../../src/models';

export default function(factory: any) {
  factory.define('rewards-ledger', RewardsLedger, {
    // Don't forget to leave off the second arg 'id' or you'll get an infinite loop
    userId: factory.assoc('user', 'id'),
    amount: () => Faker.finance.amount(),
    empyrEventId: factory.assoc('empyr-event-cleared', 'id'),
  });
}
