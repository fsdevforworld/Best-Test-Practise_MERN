import { MobilePayID } from '../../src/models';
import * as Faker from 'faker';

export default function(factory: any) {
  factory.define('mobile-pay-id', MobilePayID, {
    userId: factory.assoc('user', 'id'),
    mobilePayID: MobilePayID.hashAccountID(Faker.random.alphaNumeric(8)),
  });
}
