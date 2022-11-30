import { up as initialSeed } from './non-first-advance-identity-pass';
import { User, SynapsepayDocument, EmailVerification } from '../../src/models';
import { moment } from '@dave-inc/time-lib';
import * as Faker from 'faker';
import { deleteUser } from './delete-user';

export async function up(phoneNumberSeed: string = '281') {
  const phoneNumber = `+1${phoneNumberSeed}3308004`;

  await initialSeed(phoneNumberSeed, {
    phoneNumber,
    email: `make.jones-${phoneNumberSeed}-${Faker.random.alphaNumeric(10)}`,
    synapsepayUserId: Faker.random.alphaNumeric(24),
    synapsepayDocId: Faker.random.alphaNumeric(24),
    synapsepayNodeId: Faker.random.alphaNumeric(24),
  });

  const user = await User.findOne({
    where: { phoneNumber },
    include: [SynapsepayDocument],
  });

  await Promise.all([
    user.update({
      email: `make.jones-${phoneNumberSeed}@dave.com`,
      emailVerified: true,
      settings: { doNotDisburse: true },
    }),
    user.synapsepayDocuments[0].update({
      sanctionsScreeningMatch: true,
      licenseStatus: null,
      ssnStatus: 'VALID',
    }),
    EmailVerification.update({ verified: moment() }, { where: { userId: user.id } }),
  ]);
}

export async function down(phoneNumberSeed: string = '281') {
  const phoneNumber = `+1${phoneNumberSeed}3308004`;
  await deleteUser(phoneNumber);
}
