import * as Faker from 'faker';
import { UserAddress } from '../../src/models';

export default function(factory: any) {
  factory.define('user-address', UserAddress, {
    userId: factory.assoc('user', 'id'),
    address1: () => Faker.address.streetAddress(),
    city: () => Faker.address.city(),
    state: () => Faker.address.stateAbbr(),
    zipCode: () => Faker.address.zipCode(),
  });
}
