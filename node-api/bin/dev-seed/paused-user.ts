import * as path from 'path';
import { createUser, insertOnboardingSteps, createInternalUser } from './utils';
import factory from '../../test/factories';
import { moment } from '@dave-inc/time-lib';
import { deleteUser } from './delete-user';

async function up(phoneNumberSeed: string = '900') {
  const phone = `+1${phoneNumberSeed}3434340`;
  const firstTen = phone.substr(0, 10);
  await Promise.all([
    paused(`paused-user0-${phoneNumberSeed}@dave.com`, `${firstTen}40`),
    paused(`paused-user1-${phoneNumberSeed}@dave.com`, `${firstTen}41`),
    paused(`paused-user2-${phoneNumberSeed}@dave.com`, `${firstTen}42`),
    unpaused(`unpaused-user3-${phoneNumberSeed}@dave.com`, `${firstTen}43`),
    unpaused(`unpaused-user4-${phoneNumberSeed}@dave.com`, `${firstTen}44`),
  ]);
}

async function down(phoneNumberSeed: string = '900') {
  const phone = `+1${phoneNumberSeed}3434340`;
  const firstTen = phone.substr(0, 10);

  await Promise.all([
    deleteUser(`${firstTen}40`),
    deleteUser(`${firstTen}41`),
    deleteUser(`${firstTen}42`),
    deleteUser(`${firstTen}43`),
    deleteUser(`${firstTen}44`),
  ]);
}

async function paused(email: string, phoneNumber: string) {
  const user = await createUser({
    email,
    phoneNumber,
    firstName: path.basename(__filename).split('.')[0],
    lastName: 'membership-paused',
    emailVerified: true,
    settings: { doNotDisburse: true },
  });
  const userId = user.id;

  await insertOnboardingSteps(userId);

  await factory.create('membership-pause', {
    userId,
    created: moment(),
    updated: moment(),
  });

  const bankConnection = await factory.create('bank-connection', {
    userId,
    hasValidCredentials: true,
    hasTransactions: true,
  });

  const bankAccount = await factory.create('checking-account', {
    userId,
    institutionId: bankConnection.institutionId,
    bankConnectionId: bankConnection.id,
    current: 1400,
    available: 1400,
  });
  const bankAccountId = bankAccount.id;

  await user.update({ defaultBankAccountId: bankAccountId });
}

async function unpaused(email: string, phoneNumber: string) {
  const user = await createUser({
    email,
    phoneNumber,
    firstName: path.basename(__filename).split('.')[0],
    lastName: 'membership-unpaused',
    emailVerified: true,
    settings: { doNotDisburse: true },
  });
  const agent = await createInternalUser();
  await factory.create('unpaused-membership-pause', {
    userId: user.id,
    unpauserId: agent.id,
    pauserId: agent.id,
  });
}

export { up, down };
