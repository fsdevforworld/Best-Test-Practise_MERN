import * as Faker from 'faker';
import { UserSession } from '../../src/models';

export default function(factory: any) {
  factory.define('user-session', UserSession, {
    userId: factory.assoc('user', 'id'),
    token: Faker.random.uuid,
    deviceId: Faker.random.uuid,
    deviceType: 'ios',
  });
}
