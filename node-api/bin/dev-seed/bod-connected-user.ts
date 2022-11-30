import * as path from 'path';

import { EmailVerification, Institution } from '../../src/models';
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
import * as Faker from 'faker';

async function up(phoneNumberSeed: string = '900') {
  const phone = `+1${phoneNumberSeed}2111100`;
  const firstTen = phone.substr(0, 10);
  await Promise.all([
    make(`Bank-Of-Dave-Connection1-${phoneNumberSeed}@dave.com`, `${firstTen}00`, {
      hasTwoBankConnected: false,
    }),
    make(`Bank-Of-Dave-Connection2-${phoneNumberSeed}@dave.com`, `${firstTen}01`, {
      hasTwoBankConnected: false,
    }),
    make(`Bank-Of-Dave-Connection3-${phoneNumberSeed}@dave.com`, `${firstTen}02`, {
      hasTwoBankConnected: false,
    }),
    make(`Bank-Of-Dave-Connection4-${phoneNumberSeed}@dave.com`, `${firstTen}03`, {
      hasTwoBankConnected: false,
    }),
    make(`Bank-Of-Dave-Connection5-${phoneNumberSeed}@dave.com`, `${firstTen}04`, {
      hasTwoBankConnected: false,
    }),
    make(`two-bank-connections1-${phoneNumberSeed}@dave.com`, `${firstTen}05`, {
      hasTwoBankConnected: true,
    }),
    make(`two-bank-connections2-${phoneNumberSeed}@dave.com`, `${firstTen}06`, {
      hasTwoBankConnected: true,
    }),
    make(`two-bank-connections3-${phoneNumberSeed}@dave.com`, `${firstTen}07`, {
      hasTwoBankConnected: true,
    }),
  ]);
}

async function down(phoneNumberSeed: string = '900') {
  const phone = `+1${phoneNumberSeed}2111100`;
  const firstTen = phone.substr(0, 10);

  await Promise.all([
    deleteUser(`${firstTen}00`),
    deleteUser(`${firstTen}01`),
    deleteUser(`${firstTen}02`),
    deleteUser(`${firstTen}03`),
    deleteUser(`${firstTen}04`),
    deleteUser(`${firstTen}05`),
    deleteUser(`${firstTen}06`),
    deleteUser(`${firstTen}07`),
  ]);
}
async function make(
  email: string,
  phoneNumber: string,
  { hasTwoBankConnected }: { hasTwoBankConnected: boolean },
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
    lastName: 'User with BOD Connection',
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

  const bankConnection = await factory.create('bank-of-dave-bank-connection', {
    userId,
    hasValidCredentials: true,
    hasTransactions: true,
  });

  const bankAccount = await factory.create('checking-account', {
    userId,
    displayName: 'Bank of Dave',
    institutionId: bankConnection.institutionId,
    bankConnectionId: bankConnection.id,
    current: 1265,
    available: 1265,
    synapseNodeId,
  });
  await Institution.update(
    { displayName: bankAccount.displayName },
    { where: { id: bankAccount.institutionId } },
  );
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

  if (hasTwoBankConnected) {
    const secondBankConnection = await factory.create('bank-connection', {
      userId,
      hasValidCredentials: true,
      hasTransactions: true,
    });

    const secondBankAccount = await factory.create('checking-account', {
      userId,
      displayName: 'Bank of Tim',
      institutionId: secondBankConnection.institutionId,
      bankConnectionId: secondBankConnection.id,
      current: 1400,
      available: 1400,
      synapseNodeId: Faker.random.alphaNumeric(26),
    });

    await Institution.update(
      { displayName: secondBankAccount.displayName },
      { where: { id: secondBankAccount.institutionId } },
    );
    await user.update({ defaultBankAccountId: bankAccountId });

    const secondPaymentMethod = await factory.create('payment-method', {
      bankAccountId,
      userId,
    });

    await bankAccount.update({ defaultPaymentMethodId: secondPaymentMethod.id });
  }

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
    BankingDataSource.BankOfDave,
  );
}

export { up, down };
