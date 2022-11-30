import * as Faker from 'faker';
import { DeleteRequest } from '../../src/models';

export default function(factory: any) {
  factory.define('delete-request', DeleteRequest, {
    userId: factory.assoc('user', 'id'),
    reason: Faker.lorem.sentence,
    additionalInfo: Faker.lorem.sentence,
  });
}
