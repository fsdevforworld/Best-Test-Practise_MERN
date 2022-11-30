import * as Faker from 'faker';
import { moment } from '@dave-inc/time-lib';
import { createUser } from './utils';
import factory from '../../test/factories';
import { deleteUser } from './delete-user';

export async function up(phoneNumberSeed: string = '900') {
  await Promise.all([
    make(`+1${phoneNumberSeed}4333333`, true),
    make(`+1${phoneNumberSeed}4333334`, false),
  ]);
}

export async function down(phoneNumberSeed: string = '900') {
  await Promise.all([
    deleteUser(`+1${phoneNumberSeed}4333333`),
    deleteUser(`+1${phoneNumberSeed}4333334`),
  ]);
}

async function make(newPhoneNumber: string, changeSuccessful: boolean) {
  const now = moment();
  const currentUserPhoneNumber = Faker.phone.phoneNumber('+1##########');
  const user = await createUser({
    email: Faker.internet.email,
    phoneNumber: currentUserPhoneNumber,
    firstName: Faker.name.firstName,
    lastName: Faker.name.lastName,
    emailVerified: true,
    settings: { doNotDisburse: true },
  });

  await factory.create('phone-number-change-request', {
    userId: user.id,
    verified: changeSuccessful ? now : null,
    oldPhoneNumber: currentUserPhoneNumber,
    newPhoneNumber,
  });
  if (changeSuccessful) {
    await user.update({
      phoneNumber: newPhoneNumber,
    });
  }
}
