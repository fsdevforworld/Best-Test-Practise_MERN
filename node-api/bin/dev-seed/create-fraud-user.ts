import * as path from 'path';

import { createUser } from './utils';
import { FraudAlert } from '../../src/models';
import { deleteUser } from './delete-user';

async function up(phoneNumberSeed: string = '900') {
  const phone = `+1${phoneNumberSeed}1234040`;
  const firstTen = phone.substr(0, 10);
  await Promise.all([
    make(`fraud1-${phoneNumberSeed}@dave.com`, `${firstTen}40`),
    make(`fraud2-${phoneNumberSeed}@dave.com`, `${firstTen}41`),
    make(`fraud3-${phoneNumberSeed}@dave.com`, `${firstTen}42`),
  ]);
}

async function down(phoneNumberSeed: string = '900') {
  const phone = `+1${phoneNumberSeed}1234040`;
  const firstTen = phone.substr(0, 10);

  await Promise.all([
    deleteUser(`${firstTen}40`),
    deleteUser(`${firstTen}41`),
    deleteUser(`${firstTen}42`),
  ]);
}

async function make(email: string, phoneNumber: string) {
  const addressLine1 = '123 Fraud St';
  const state = 'CA';
  const city = 'Los Angeles';
  const zipCode = '90019';
  const user = await createUser({
    email,
    phoneNumber,
    firstName: path.basename(__filename).split('.')[0],
    lastName: 'Fraudy Bear',
    addressLine1,
    state,
    city,
    zipCode,
    fraud: true,
    settings: { doNotDisburse: true },
  });

  const userId = user.id;

  await FraudAlert.create({
    userId,
    reason: 'Fraudy fraudster lives at this address',
  });
}

export { up, down };
