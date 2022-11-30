import { DonationOrganizationCode } from '@dave-inc/wire-typings';

import { User } from '../../../../src/models';
import factory from '../../../../test/factories';
import { deleteDataForUser } from '../../delete-user';
import { createUser } from '../../utils';
import { getAdvanceDateOptions, getEmail } from '../utils';

const email = 'multiple-advances@dave.com';

async function up(phoneNumberSeed: string) {
  const user = await createUser({
    firstName: 'Multiple Advances',
    lastName: 'Dashboard Seed',
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
    displayName: 'Lady Stardust, LLC',
    lastFour: '1234',
    institutionId: bankConnection.institutionId,
    bankConnectionId: bankConnection.id,
    current: 500,
    available: 450,
  });

  const bankAccountId = bankAccount.id;
  await user.update({ defaultBankAccountId: bankAccountId });

  const [advance1, advance2] = await Promise.all([
    factory.create('advance', {
      userId,
      amount: 75,
      fee: 5,
      outstanding: 75,
      disbursementStatus: 'COMPLETED',
      delivery: 'EXPRESS',
      payableId: bankAccountId,
      ...getAdvanceDateOptions('2020-11-15'),
    }),
    factory.create('advance', {
      userId,
      amount: 100,
      fee: 0,
      outstanding: 100,
      disbursementStatus: 'COMPLETED',
      delivery: 'EXPRESS',
      payableId: bankAccountId,
      ...getAdvanceDateOptions('2020-12-20'),
    }),
  ]);

  await Promise.all([
    factory.create('advance-tip', {
      advanceId: advance1.id,
      amount: 3.75,
      percent: 5,
      donationOrganization: DonationOrganizationCode.TREES,
    }),
    factory.create('advance-tip', {
      advanceId: advance2.id,
      amount: 10,
      percent: 10,
      donationOrganization: DonationOrganizationCode.FEEDING_AMERICA,
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
