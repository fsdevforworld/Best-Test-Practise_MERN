import * as Faker from 'faker';
import { FraudAlert } from '../../src/models';

export default function(factory: any) {
  factory.define('fraud-alert', FraudAlert, {
    userId: factory.assoc('user', 'id'),
    reason: Faker.hacker.phrase,
  });
}
