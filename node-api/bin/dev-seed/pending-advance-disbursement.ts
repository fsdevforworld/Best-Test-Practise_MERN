import { DonationOrganizationCode } from '@dave-inc/wire-typings';
import { createUser, insertOnboardingSteps } from './utils';
import factory from '../../test/factories';
import { moment } from '@dave-inc/time-lib';
import { deleteUser } from './delete-user';

async function up(phoneNumberSeed: string = '900') {
  await Promise.all([
    make(
      `pending-disbursement-${phoneNumberSeed}@dave.com`,
      `+1${phoneNumberSeed}2223322`,
      'PENDING',
      'EXPRESS',
    ),
  ]);
}

async function down(phoneNumberSeed: string = '900') {
  await deleteUser(`+1${phoneNumberSeed}2223322`);
}

async function make(
  email: string,
  phoneNumber: string,
  disbursementStatus: string,
  delivery: string,
) {
  const user = await createUser({
    email,
    phoneNumber,
    firstName: 'pending advance disbursement',
    lastName: 'open advance',
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

  const created = moment().subtract(2, 'days');
  const advance = await factory.create('advance', {
    userId,
    disbursementStatus,
    delivery,
    created,
  });
  await factory.create('advance-tip', {
    advanceId: advance.id,
    donationOrganization: DonationOrganizationCode.TREES,
  });
}

export { up, down };
