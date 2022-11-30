import { EmailVerification } from '../../src/models';
import { moment } from '@dave-inc/time-lib';
import { createUser } from './utils';
import { deleteUser } from './delete-user';

async function up(phoneNumberSeed: string = '900') {
  const phone = `+1${phoneNumberSeed}5551200`;
  const firstTen = phone.substr(0, 10);
  await Promise.all([
    make(`bank-refer0-${phoneNumberSeed}@dave.com`, `${firstTen}00`, 'pass-name'),
    make(`bank-refer1-${phoneNumberSeed}@dave.com`, `${firstTen}01`, 'image-low-res'),
    make(`bank-refer2-${phoneNumberSeed}@dave.com`, `${firstTen}02`, 'image-not-focused'),
    make(`bank-refer3-${phoneNumberSeed}@dave.com`, `${firstTen}03`, 'image-glare'),
    make(`bank-refer4-${phoneNumberSeed}@dave.com`, `${firstTen}04`, 'bad-address'),
    make(`bank-refer5-${phoneNumberSeed}@dave.com`, `${firstTen}05`, 'bad-hombre'),
  ]);
}

async function down(phoneNumberSeed: string = '900') {
  const phone = `+1${phoneNumberSeed}5551200`;
  const firstTen = phone.substr(0, 10);

  await Promise.all([
    deleteUser(`${firstTen}00`),
    deleteUser(`${firstTen}01`),
    deleteUser(`${firstTen}02`),
    deleteUser(`${firstTen}03`),
    deleteUser(`${firstTen}04`),
    deleteUser(`${firstTen}05`),
  ]);
}

async function make(email: string, phoneNumber: string, lastName: string) {
  const now = moment();

  const user = await createUser({
    email,
    phoneNumber,
    firstName: 'test-docv',
    lastName,
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
