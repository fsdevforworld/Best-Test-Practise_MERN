import * as Faker from 'faker';
import { BankingDirectUserSession } from '../../src/models';

export default function(factory: any) {
  factory.define('banking-direct-user-session', BankingDirectUserSession, {
    userId: factory.assoc('user', 'id'),
    token: Faker.random.uuid,
  });
}
