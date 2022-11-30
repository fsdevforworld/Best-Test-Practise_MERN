import * as Faker from 'faker';
import { PhoneNumberChangeRequest } from '../../src/models';

export default function(factory: any) {
  factory.define('phone-number-change-request', PhoneNumberChangeRequest, {
    userId: factory.assoc('user', 'id'),
    oldPhoneNumber: () => Faker.phone.phoneNumber('+1##########'),
    newPhoneNumber: () => Faker.phone.phoneNumber('+1##########'),
  });
}
