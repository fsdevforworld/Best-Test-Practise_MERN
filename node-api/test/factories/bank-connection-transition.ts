import * as Faker from 'faker';
import { BankConnectionTransition } from '../../src/models';

export default function(factory: any) {
  factory.define('bank-connection-transition', BankConnectionTransition, {
    fromBankConnectionId: factory.assoc('bank-connection', 'id'),
    toBankConnectionId: factory.assoc('bank-connection', 'id'),
    fromDefaultBankAccountId: factory.assoc('bank-account', 'id'),
    hasActivatedPhysicalCard: Faker.random.boolean,
    hasReceivedFirstPaycheck: Faker.random.boolean,
    hasReceivedRecurringPaycheck: Faker.random.boolean,
  });
}
