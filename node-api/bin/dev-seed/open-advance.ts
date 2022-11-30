import * as path from 'path';
import { DonationOrganizationCode } from '@dave-inc/wire-typings';
import { createUser, insertOnboardingSteps } from './utils';
import factory from '../../test/factories';
import { moment } from '@dave-inc/time-lib';
import { deleteUser } from './delete-user';
import * as Faker from 'faker';

async function up(phoneNumberSeed: string = '900') {
  const phone = `+1${phoneNumberSeed}3756721`;
  const firstTen = phone.substr(0, 10);
  await Promise.all([
    make(`open-advance-disbursed21-${phoneNumberSeed}@dave.com`, `${firstTen}21`, 100),
    make(`open-advance-disbursed22-${phoneNumberSeed}@dave.com`, `${firstTen}22`, 75),
    make(`open-advance-disbursed23-${phoneNumberSeed}@dave.com`, `${firstTen}23`, 50),
    make(`open-advance-disbursed24-${phoneNumberSeed}@dave.com`, `${firstTen}24`, 0.2),
    make(`open-advance-disbursed25-${phoneNumberSeed}@dave.com`, `${firstTen}25`, 0.15),
    make(`open-advance-disbursed26-${phoneNumberSeed}@dave.com`, `${firstTen}26`, 0.1),
  ]);
}

async function down(phoneNumberSeed: string = '900') {
  const phone = `+1${phoneNumberSeed}3756721`;
  const firstTen = phone.substr(0, 10);

  await Promise.all([
    deleteUser(`${firstTen}21`),
    deleteUser(`${firstTen}22`),
    deleteUser(`${firstTen}23`),
    deleteUser(`${firstTen}24`),
    deleteUser(`${firstTen}25`),
    deleteUser(`${firstTen}26`),
  ]);
}

async function make(email: string, phoneNumber: string, advanceAmount: number) {
  const synapsepayId = Faker.random.alphaNumeric(20);

  const user = await createUser({
    email,
    phoneNumber,
    synapsepayId,
    firstName: path.basename(__filename).split('.')[0],
    lastName: 'open advance',
    emailVerified: true,
  });

  const userId = user.id;

  const processor = 'TABAPAY';
  const approvalCode = '07864';
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
  await user.update({ defaultBankAccountId: bankAccount.id });
  await insertOnboardingSteps(user.id);

  const paymentMethod = await factory.create('payment-method', {
    availability: 'immediate',
    bankAccountId: bankAccount.id,
    userId,
  });
  await bankAccount.update({ defaultPaymentMethodId: paymentMethod.id });
  const bankTransaction = await factory.create('bank-transaction', { userId });

  const advanceCreated = moment().subtract(4, 'days');

  const advance = await factory.create('advance', {
    userId,
    amount: advanceAmount,
    approvalCode,
    bankAccountId: bankAccount.id,
    created: advanceCreated,
    updated: advanceCreated,
    delivery: 'EXPRESS',
    createdDate: advanceCreated,
    disbursementStatus: 'COMPLETED',
    disbursementProcessor: processor,
    disbursementBankTransactionId: bankTransaction.id,
    disbursementBankTransactionUuid: bankTransaction.externalId,
    outstanding: advanceAmount,
    paymentMethodId: paymentMethod.id,
  });

  const advanceId = advance.id;

  const tipAmount = advanceAmount > 1 ? 1 : 0;

  await factory.create('advance-tip', {
    advanceId,
    amount: tipAmount,
    donationOrganization: DonationOrganizationCode.FEEDING_AMERICA,
  });
}

export { up, down };
