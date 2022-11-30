import { createUser } from './utils';
import factory from '../../test/factories';
import { moment } from '@dave-inc/time-lib';
import * as Faker from 'faker';

export async function up(phoneNumberSeed: string = '123') {
  const [referrer, referred] = await Promise.all([
    createUser({
      firstName: 'Friendly',
      lastName: 'Daverson',
      email: `friendly-${phoneNumberSeed}-${Faker.random.alphaNumeric(8)}@dave.com`,
      settings: { doNotDisburse: true },
    }),
    createUser({
      firstName: 'Referred',
      lastName: 'Daverson',
      email: `referred-${phoneNumberSeed}-${Faker.random.alphaNumeric(8)}@dave.com`,
      settings: { doNotDisburse: true },
    }),
  ]);

  await Promise.all([
    factory.create('campaign-info', { userId: null, referrerId: referrer.id }),
    factory.create('campaign-info', {
      userId: referred.id,
      referrerId: referrer.id,
      created: moment().subtract(2, 'days'),
      bankConnectedDate: moment().subtract(1, 'day'),
    }),
  ]);
}
