import { moment } from '@dave-inc/time-lib';
import { DonationOrganizationCode, ExternalTransactionProcessor } from '@dave-inc/wire-typings';

import { User } from '../../../../src/models';
import factory from '../../../../test/factories';
import { deleteDataForUser } from '../../delete-user';
import { createUser } from '../../utils';
import { getEmail } from '../utils';

const email = 'cool-off-user@dave.com';

async function up(phoneNumberSeed: string) {
  const user = await createUser({
    firstName: 'Cooled Off User',
    lastName: 'Seed',
    email: getEmail(phoneNumberSeed, email),
  });

  const created = moment().startOf('second');

  const advance = await factory.create('advance', {
    userId: user.id,
    amount: 24.99,
    created: created.clone().subtract(5, 'second'),
  });

  await factory.create('advance-tip', {
    advanceId: advance.id,
    donationOrganization: DonationOrganizationCode.TREES,
  });

  await factory.create('payment', {
    advanceId: advance.id,
    amount: 12,
    created,
    externalProcessor: ExternalTransactionProcessor.Tabapay,
  });
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
