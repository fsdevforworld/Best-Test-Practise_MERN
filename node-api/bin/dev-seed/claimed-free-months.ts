import * as path from 'path';
import { createUser, insertOnboardingSteps } from './utils';
import factory from '../../test/factories';
import { deleteUser } from './delete-user';
import * as Faker from 'faker';

async function up(phoneNumberSeed: string = '900') {
  const phone = `+1${phoneNumberSeed}5050500`;
  const firstTen = phone.substr(0, 10);
  await Promise.all([
    make(`got-free-months0-${phoneNumberSeed}@dave.com`, `${firstTen}00`),
    make(`got-free-months1-${phoneNumberSeed}@dave.com`, `${firstTen}01`),
    make(`got-free-months2-${phoneNumberSeed}@dave.com`, `${firstTen}02`),
  ]);
}

async function down(phoneNumberSeed: string = '900') {
  const phone = `+1${phoneNumberSeed}5050500`;
  const firstTen = phone.substr(0, 10);

  await Promise.all([
    deleteUser(`${firstTen}00`),
    deleteUser(`${firstTen}01`),
    deleteUser(`${firstTen}02`),
  ]);
}

async function make(email: string, phoneNumber: string) {
  const user = await createUser({
    email,
    phoneNumber,
    firstName: path.basename(__filename).split('.')[0],
    lastName: 'user already got free months',
    emailVerified: true,
    settings: { doNotDisburse: true },
  });
  const userId = user.id;

  await insertOnboardingSteps(userId);

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

  const subPromotion = await factory.create('subscription-billing-promotion', {
    code: Faker.random.words(10),
  });

  await factory.create('redeemed-subscription-billing-promotion', {
    userId,
    subscriptionBillingPromotionId: subPromotion.id,
  });
}

export { up, down };
