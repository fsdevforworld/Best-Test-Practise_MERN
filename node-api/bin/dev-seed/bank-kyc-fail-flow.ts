import { EmailVerification } from '../../src/models';
import { moment } from '@dave-inc/time-lib';
import { createUser } from './utils';
import { deleteUser } from './delete-user';

async function up(phoneNumberSeed: string = '900') {
  const phone = `+1${phoneNumberSeed}5551300`;
  const firstTen = phone.substr(0, 10);
  await make(`bank-kyc-fail${phoneNumberSeed}@dave.com`, `${firstTen}00`);
}

async function down(phoneNumberSeed: string = '900') {
  const phone = `+1${phoneNumberSeed}5551300`;
  const firstTen = phone.substr(0, 10);

  await deleteUser(`${firstTen}00`);
}

async function make(email: string, phoneNumber: string) {
  const now = moment();

  const user = await createUser({
    email,
    phoneNumber,
    firstName: 'Jane',
    lastName: 'Doe',
    birthdate: '1990-01-01',
    addressLine1: '1600 Pennsylvania Ave',
    city: 'Los Angeles',
    state: 'CA',
    zipCode: '90033',
    emailVerified: true,
  });
  const userId = user.id;

  await EmailVerification.update({ verified: now }, { where: { userId } });
}

export { up, down };
