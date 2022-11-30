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

export async function up(phoneNumberSeed: string = '900') {
  await Promise.all([
    make(`onboarding-${phoneNumberSeed}@dave.com`, `+1${phoneNumberSeed}1111101`, false, true),
    make(`onboarding2-${phoneNumberSeed}@dave.com`, `+1${phoneNumberSeed}1111104`, true, true),
    make(`onboarding3-${phoneNumberSeed}@dave.com`, `+1${phoneNumberSeed}1111108`, false, true),
    make(`onboarding4-${phoneNumberSeed}@dave.com`, `+1${phoneNumberSeed}1111109`, false),
  ]);
}

export async function down(phoneNumberSeed: string = '900') {
  await Promise.all([
    deleteUser(`+1${phoneNumberSeed}1111101`),
    deleteUser(`+1${phoneNumberSeed}1111104`),
    deleteUser(`+1${phoneNumberSeed}1111108`),
    deleteUser(`+1${phoneNumberSeed}1111109`),
  ]);
}

async function make(
  email: string,
  phoneNumber: string,
  hasNoPassword: boolean,
  hasRecurringTransactions?: boolean,
) {
  const now = moment();
  const synapsepayId = Faker.random.alphaNumeric(20);
  const synapsepayDocId = Faker.random.alphaNumeric(22);
  const synapseNodeId = Faker.random.alphaNumeric(24);

  const user = await createUser({
    email,
    phoneNumber,
    synapsepayId,
    firstName: path.basename(__filename).split('.')[0],
    lastName: 'Set Low Balance Alert Screen',
    settings: { default_tip: 10, doNotDisburse: true },
    emailVerified: true,
    hasNoPassword,
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
  const onboardingSteps = ['SelectAccount', 'AddDebitCard'];
  if (!hasNoPassword) {
    onboardingSteps.push('AddEmailAndPasswordOnboarding');
  }
  for (const step of onboardingSteps) {
    await insert('onboarding_step', { userId, step });
  }
  if (hasRecurringTransactions) {
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
  }

  await insertSixtyDaysHistory(userId, bankAccountId);
  await BankingDataSync.backfillDailyBalances(
    bankAccount,
    BalanceLogCaller.BinDevSeed,
    BankingDataSource.Plaid,
  );
}
