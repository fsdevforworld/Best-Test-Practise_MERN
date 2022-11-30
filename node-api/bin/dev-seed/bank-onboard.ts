import * as path from 'path';

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
import { deleteUser } from './delete-user';
import factory from '../../test/factories';
import { BankingDataSource } from '@dave-inc/wire-typings';
import * as Faker from 'faker';

async function up(phoneNumberSeed: string = '900') {
  const phone = `+1${phoneNumberSeed}5551100`;
  const firstTen = phone.substr(0, 10);
  await Promise.all([
    make(`bank-onboard0-${phoneNumberSeed}@dave.com`, `${firstTen}00`, {
      hasExternalBank: false,
      hasGoalTesterRole: false,
    }),
    make(`bank-onboard1-${phoneNumberSeed}@dave.com`, `${firstTen}01`, {
      hasExternalBank: true,
      hasGoalTesterRole: false,
    }),
    make(`bank-onboard2-${phoneNumberSeed}@dave.com`, `${firstTen}02`, {
      hasExternalBank: false,
      hasGoalTesterRole: true,
    }),
    make(`bank-onboard3-${phoneNumberSeed}@dave.com`, `${firstTen}03`, {
      hasExternalBank: true,
      hasGoalTesterRole: true,
    }),
  ]);
}

async function down(phoneNumberSeed: string = '900') {
  const phone = `+1${phoneNumberSeed}5551100`;
  const firstTen = phone.substr(0, 10);

  await Promise.all([
    deleteUser(`${firstTen}00`),
    deleteUser(`${firstTen}01`),
    deleteUser(`${firstTen}02`),
    deleteUser(`${firstTen}03`),
  ]);
}

async function make(
  email: string,
  phoneNumber: string,
  {
    hasExternalBank,
    hasGoalTesterRole,
  }: {
    hasExternalBank: boolean;
    hasGoalTesterRole: boolean;
  },
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
    lastName: 'onboarding',
    birthdate: '1990-01-01',
    addressLine1: '1600 Pennsylvania Ave',
    city: 'Los Angeles',
    state: 'CA',
    zipCode: '90033',
    emailVerified: true,
  });
  const userId = user.id;

  await EmailVerification.update({ verified: now }, { where: { userId } });

  if (hasExternalBank) {
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
      synapseNodeId,
      current: 1400,
      available: 1400,
    });

    const bankAccountId = bankAccount.id;

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

  if (hasGoalTesterRole) {
    await factory.create('user-role', {
      userId,
      roleId: 11,
    });
  }
}

export { up, down };
