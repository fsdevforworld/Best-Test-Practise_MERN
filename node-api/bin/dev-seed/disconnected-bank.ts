import * as path from 'path';

import { EmailVerification } from '../../src/models';
import { moment } from '@dave-inc/time-lib';
import * as BankingDataSync from '../../src/domain/banking-data-sync';
import { BalanceLogCaller } from '../../src/typings';
import { createUser, insertOnboardingSteps } from './utils';
import factory from '../../test/factories';
import { deleteUser } from './delete-user';
import { BankingDataSource } from '@dave-inc/wire-typings';
import * as Faker from 'faker';

async function up(phoneNumberSeed: string = '900') {
  const phone = `+1${phoneNumberSeed}1111120`;
  const firstTen = phone.substr(0, 10);
  await Promise.all([
    make(`bank-disconnected1-${phoneNumberSeed}@dave.com`, `${firstTen}20`),
    make(`bank-disconnected2-${phoneNumberSeed}@dave.com`, `${firstTen}21`),
    make(`bank-disconnected3-${phoneNumberSeed}@dave.com`, `${firstTen}22`),
  ]);
}

async function down(phoneNumberSeed: string = '900') {
  const phone = `+1${phoneNumberSeed}1111120`;
  const firstTen = phone.substr(0, 10);

  await Promise.all([
    deleteUser(`${firstTen}20`),
    deleteUser(`${firstTen}21`),
    deleteUser(`${firstTen}22`),
  ]);
}

async function make(email: string, phoneNumber: string) {
  const now = moment();
  const synapsepayId = Faker.random.alphaNumeric(20);
  const synapseNodeId = Faker.random.alphaNumeric(22);

  const user = await createUser({
    email,
    phoneNumber,
    synapsepayId,
    firstName: path.basename(__filename).split('.')[0],
    lastName: 'Disconnected bank',
    settings: { default_tip: 10, doNotDisburse: true },
    emailVerified: true,
  });
  const userId = user.id;

  await EmailVerification.update({ verified: now }, { where: { userId } });

  const bankConnection = await factory.create('bank-connection', {
    userId,
    hasValidCredentials: false,
    hasTransactions: true,
  });

  const bankAccount = await factory.create('checking-account', {
    userId,
    institutionId: bankConnection.institutionId,
    bankConnectionId: bankConnection.id,
    current: 1400,
    available: 1400,
    synapseNodeId,
  });
  const bankAccountId = bankAccount.id;

  await user.update({ defaultBankAccountId: bankAccountId });

  await factory.create('payment-method', {
    bankAccountId,
    userId,
  });

  const paymentMethod = await factory.create('payment-method', {
    bankAccountId: bankAccount.id,
    userId,
  });

  await bankAccount.update({ defaultPaymentMethodId: paymentMethod.id });

  await insertOnboardingSteps(userId);

  await BankingDataSync.backfillDailyBalances(
    bankAccount,
    BalanceLogCaller.BinDevSeed,
    BankingDataSource.Plaid,
  );
}

export { up, down };
