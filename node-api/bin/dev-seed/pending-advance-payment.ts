import { DonationOrganizationCode } from '@dave-inc/wire-typings';
import { createUser, insertOnboardingSteps } from './utils';
import factory from '../../test/factories';
import { moment } from '@dave-inc/time-lib';
import { deleteUser } from './delete-user';

async function up(phoneNumberSeed: string = '900') {
  await Promise.all([
    make(`pending-payment1-${phoneNumberSeed}@dave.com`, `+1${phoneNumberSeed}1231233`, 'EXPRESS'),
    make(`pending-payment2-${phoneNumberSeed}@dave.com`, `+1${phoneNumberSeed}1231244`, 'STANDARD'),
  ]);
}

async function down(phoneNumberSeed: string = '900') {
  await Promise.all([
    deleteUser(`+1${phoneNumberSeed}1231233`),
    deleteUser(`+1${phoneNumberSeed}1231244`),
  ]);
}

async function make(email: string, phoneNumber: string, delivery: string) {
  const user = await createUser({
    email,
    phoneNumber,
    firstName: 'pending advance payment',
    lastName: 'paid advance',
    settings: { doNotDisburse: true },
  });

  const userId = user.id;

  const bankConnection = await factory.create('bank-connection', {
    userId,
    hasValidCredentials: true,
    hasTransactions: true,
  });

  const bankAccount = await factory.create('checking-account', {
    userId,
    institutionId: bankConnection.institutionId,
    bankConnectionId: bankConnection.id,
    current: 500,
    available: 500,
  });

  const bankAccountId = bankAccount.id;
  await user.update({ defaultBankAccountId: bankAccountId });

  await insertOnboardingSteps(userId);

  const created = moment().subtract(7, 'days');

  const advance = await factory.create('advance', {
    userId,
    outstanding: '0.00',
    disbursementStatus: 'COMPLETED',
    delivery,
    created,
  });

  const advanceId = advance.id;

  await factory.create('payment', {
    userId,
    advanceId,
    bankAccountId,
    externalProcessor: 'TABAPAY',
    paymentStatus: 'PENDING',
  });

  await factory.create('advance-tip', {
    advanceId: advance.id,
    donationOrganization: DonationOrganizationCode.TREES,
  });
}

export { up, down };
