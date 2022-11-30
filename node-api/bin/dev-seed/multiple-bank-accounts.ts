import * as path from 'path';

import { EmailVerification } from '../../src/models';
import { moment } from '@dave-inc/time-lib';
import * as BankingDataSync from '../../src/domain/banking-data-sync';
import { BalanceLogCaller } from '../../src/typings';
import {
  createUser,
  insert,
  insertNormalIncomeTransactions,
  insertSixtyDaysHistory,
} from './utils';
import factory from '../../test/factories';
import { deleteUser } from './delete-user';
import { BankingDataSource } from '@dave-inc/wire-typings';
import * as Faker from 'faker';

async function up(phoneNumberSeed: string = '900') {
  const phone = `+1${phoneNumberSeed}1111160`;
  const firstTen = phone.substr(0, 10);
  await Promise.all([
    make(`multiplebankaccounts-${phoneNumberSeed}@dave.com`, `${firstTen}60`, false),
    make(`multiplebankaccounts2-${phoneNumberSeed}@dave.com`, `${firstTen}61`, true),
    make(`multiplebankaccounts3-${phoneNumberSeed}@dave.com`, `${firstTen}62`, true),
  ]);
}

async function down(phoneNumberSeed: string = '900') {
  const phone = `+1${phoneNumberSeed}1111160`;
  const firstTen = phone.substr(0, 10);

  await Promise.all([
    deleteUser(`${firstTen}60`),
    deleteUser(`${firstTen}61`),
    deleteUser(`${firstTen}62`),
  ]);
}

async function make(email: string, phoneNumber: string, hasOnboardingSteps: boolean) {
  const now = moment();
  const phone = phoneNumber.replace(/\+/, '');
  const synapsepayId = Faker.random.alphaNumeric(20);
  const synapsepayDocId = Faker.random.alphaNumeric(22);
  const synapseNodeId = Faker.random.alphaNumeric(24);

  const user = await createUser({
    email,
    phoneNumber,
    synapsepayId,
    firstName: path.basename(__filename).split('.')[0],
    lastName: 'Multiple Checking And Savings account',
    settings: { default_tip: 10, doNotDisburse: true },
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

  const checkingAccount1 = await factory.create('checking-account', {
    userId,
    institutionId: bankConnection.institutionId,
    bankConnectionId: bankConnection.id,
    displayName: 'Checking Account One',
    current: 1400,
    available: 1400,
    synapseNodeId,
  });

  await factory.create('checking-account', {
    userId,
    institutionId: bankConnection.institutionId,
    bankConnectionId: bankConnection.id,
    displayName: 'Checking Account Two',
    current: 666,
    available: 999,
    synapseNodeId: `${phone}secondaccount`,
  });

  await factory.create('bank-account', {
    userId,
    institutionId: bankConnection.institutionId,
    bankConnectionId: bankConnection.id,
    displayName: 'Savings Account',
    current: 1400,
    available: 1400,
    synapseNodeId: `${phone}savingsaccount`,
  });

  const bankAccountId = checkingAccount1.id;

  await user.update({ defaultBankAccountId: bankAccountId });

  await factory.create('payment-method', {
    bankAccountId,
    userId,
  });

  const { recurringTransactionId } = await insertNormalIncomeTransactions(
    userId,
    bankAccountId,
    { name: 'My Profitable Gambling Habit', amount: 500 },
    true,
  );

  await checkingAccount1.update({ mainPaycheckRecurringTransactionId: recurringTransactionId });

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

  if (hasOnboardingSteps) {
    const onboardingSteps = ['SelectAccount', 'AddDebitCard'];
    for (const step of onboardingSteps) {
      await insert('onboarding_step', { userId, step });
    }
  }

  await insertSixtyDaysHistory(userId, bankAccountId);
  await BankingDataSync.backfillDailyBalances(
    checkingAccount1,
    BalanceLogCaller.BinDevSeed,
    BankingDataSource.Plaid,
  );
}

export { up, down };
