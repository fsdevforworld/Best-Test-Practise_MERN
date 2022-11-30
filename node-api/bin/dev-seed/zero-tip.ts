import * as path from 'path';
import * as Faker from 'faker';

import { EmailVerification } from '../../src/models';
import { moment } from '@dave-inc/time-lib';
import * as BankingDataSync from '../../src/domain/banking-data-sync';
import { BalanceLogCaller } from '../../src/typings';
import {
  createUser,
  insertNormalIncomeTransactions,
  insertOnboardingSteps,
  insertSixtyDaysHistory,
} from './utils';
import factory from '../../test/factories';
import { deleteUser } from './delete-user';
import { BankingDataSource } from '@dave-inc/wire-typings';

async function up(phoneNumberSeed: string = '900') {
  const phone = `+1${phoneNumberSeed}1111150`;
  const firstTen = phone.substr(0, 10);
  await Promise.all([
    make(`zero-tip1-${phoneNumberSeed}@dave.com`, `${firstTen}50`),
    make(`zero-tip2-${phoneNumberSeed}@dave.com`, `${firstTen}51`),
    make(`zero-tip3-${phoneNumberSeed}@dave.com`, `${firstTen}52`),
  ]);
}

async function down(phoneNumberSeed: string = '900') {
  const phone = `+1${phoneNumberSeed}1111150`;
  const firstTen = phone.substr(0, 10);

  const changedPhoneNumber = `+1${phoneNumberSeed}0000151`;

  await Promise.all([
    deleteUser(`${firstTen}50`),
    deleteUser(`${firstTen}51`),
    deleteUser(`${firstTen}52`),
    // delete user from change phone number UI test
    deleteUser(changedPhoneNumber),
  ]);
}

async function make(email: string, phoneNumber: string) {
  const now = moment();
  const phone = phoneNumber.replace(/\+/, '');
  const synapsepayId = Faker.random.alphaNumeric(24).substring(17) + phone;
  const synapseNodeId = Faker.random.alphaNumeric(24).substring(17) + phone;
  const synapsepayDocId = Faker.random.alphaNumeric(24);

  const user = await createUser({
    email,
    phoneNumber,
    synapsepayId,
    firstName: path.basename(__filename).split('.')[0],
    lastName: 'No default tip',
    settings: { default_tip: 0, doNotDisburse: true },
    emailVerified: true,
  });
  const userId = user.id;

  await EmailVerification.update({ verified: now }, { where: { userId } });

  await factory.create('synapsepay-document', {
    userId,
    synapsepayUserId: synapsepayId,
    synapsepayDocId,
    phoneNumber,
  });

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

  const { recurringTransactionId } = await insertNormalIncomeTransactions(
    userId,
    bankAccountId,
    { name: 'My Profitable Gambling Habit', amount: 500 },
    true,
  );

  await bankAccount.update({ mainPaycheckRecurringTransactionId: recurringTransactionId });

  await insertNormalIncomeTransactions(
    userId,
    bankAccountId,
    { name: 'My Non Profitable Gambling Habit', amount: -500 },
    false,
  );

  const date = moment().add(4, 'days');
  await insertNormalIncomeTransactions(
    userId,
    bankAccountId,
    { name: 'My Non Profitable Gambling Habit 2', amount: 20, date },
    false,
  );

  await insertSixtyDaysHistory(userId, bankAccountId);
  await BankingDataSync.backfillDailyBalances(
    bankAccount,
    BalanceLogCaller.BinDevSeed,
    BankingDataSource.Plaid,
  );
}

export { up, down };
