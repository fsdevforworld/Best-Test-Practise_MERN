import * as Faker from 'faker';
import { moment } from '@dave-inc/time-lib';
import { TabapayKey } from '../../src/models';

export default function(factory: any) {
  factory.define('tabapay-key', TabapayKey, {
    keyId: () => Faker.random.alphaNumeric(),
    key: () => Faker.random.alphaNumeric(),
    expiration: () => moment().add(6, 'months'),
  });
}
