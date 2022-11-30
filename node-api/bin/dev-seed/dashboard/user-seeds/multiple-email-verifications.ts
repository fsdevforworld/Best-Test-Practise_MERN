import { moment } from '@dave-inc/time-lib';

import { EmailVerification, User } from '../../../../src/models';
import factory from '../../../../test/factories';
import { deleteDataForUser } from '../../delete-user';
import { createUser } from '../../utils';
import { getEmail } from '../utils';

const email = 'ziggy-stardust@spidersfrom.mars';

async function up(phoneNumberSeed: string) {
  const user = await createUser({
    firstName: 'Multiple Email Verifications',
    lastName: 'Dashboard Seed',
    email: getEmail(phoneNumberSeed, email),
    emailVerified: true,
    birthdate: '1972-06-16',
    addressLine1: '123 Wild Side Walk',
    addressLine2: 'Apt 1',
    city: 'Suffragette City',
    state: 'CA',
    zipCode: '99999',
  });

  const userId = user.id;

  await EmailVerification.update({ verified: moment() }, { where: { userId } });

  await Promise.all([
    factory.create('email-verification', {
      userId,
      email: getEmail(phoneNumberSeed, 'lady-stardust@spidersfrom.mars'),
      verified: moment()
        .subtract(2, 'months')
        .add(5, 'minutes'),
      created: moment().subtract(2, 'months'),
    }),
    factory.create('email-verification', {
      userId,
      email: getEmail(phoneNumberSeed, 'dave-dabowie@diamond.dogs'),
      created: moment().subtract(3, 'months'),
    }),
    factory.create('email-verification', {
      userId,
      email: getEmail(phoneNumberSeed, 'major-tom@venture.industries'),
      verified: moment()
        .subtract(4, 'months')
        .add(5, 'minutes'),
      created: moment().subtract(4, 'months'),
    }),
    factory.create('email-verification', {
      userId,
      email: getEmail(phoneNumberSeed, 'the@jean.genie'),
      created: moment().subtract(5, 'months'),
    }),
  ]);
}

async function down(phoneNumberSeed: string) {
  const user = await User.findOne({
    where: {
      email: getEmail(phoneNumberSeed, email),
    },
  });

  if (user) {
    await deleteDataForUser(user);
  }
}

export { up, down };
