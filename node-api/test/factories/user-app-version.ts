import * as Faker from 'faker';
import { UserAppVersion } from '../../src/models';

export default function(factory: any) {
  factory.define('user-app-version', UserAppVersion, {
    userId: factory.assoc('user', 'id'),
    deviceType: 'ios',
    appVersion: Faker.random.alphaNumeric(7),
  });
}
