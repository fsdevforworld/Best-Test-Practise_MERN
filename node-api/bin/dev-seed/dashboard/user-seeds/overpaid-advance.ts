import { moment } from '@dave-inc/time-lib';
import { DonationOrganizationCode } from '@dave-inc/wire-typings';

import { User } from '../../../../src/models';
import factory from '../../../../test/factories';
import { deleteDataForUser } from '../../delete-user';
import { createUser } from '../../utils';
import { getEmail } from '../utils';

const email = 'overpaid-advance@dave.com';

async function up(phoneNumberSeed: string) {
  const user = await createUser({
    firstName: 'Overpaid Advance',
    lastName: 'Seed',
    email: getEmail(phoneNumberSeed, email),
  });

  const userId = user.id;

  const bankConnection = await factory.create('bank-connection', {
    userId,
    hasValidCredentials: true,
    hasTransactions: true,
  });

  const bankAccount = await factory.create('checking-account', {
    userId,
    displayName: 'Candy Kingdom, LLC',
    lastFour: '1234',
    institutionId: bankConnection.institutionId,
    bankConnectionId: bankConnection.id,
    current: 500,
    available: 500,
  });

  const bankAccountId = bankAccount.id;
  await user.update({ defaultBankAccountId: bankAccountId });

  const created = moment().subtract(7, 'days');

  const advance = await factory.create('advance', {
    userId,
    amount: 50,
    fee: 3,
    outstanding: -50,
    disbursementStatus: 'COMPLETED',
    delivery: 'EXPRESS',
    payableId: bankAccountId,
    created,
  });

  const advanceId = advance.id;

  await factory.create('advance-tip', {
    advanceId,
    amount: 5,
    percent: 10,
    donationOrganization: DonationOrganizationCode.TREES,
  });

  await factory.create('payment', {
    amount: 110,
    userId,
    advanceId,
    bankAccountId,
    externalProcessor: 'TABAPAY',
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
