import * as path from 'path';

import { EmailVerification, BankAccount } from '../../src/models';
import { BankingDataSource, MicroDeposit } from '@dave-inc/wire-typings';
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
import * as Faker from 'faker';

async function up(phoneNumberSeed: string = '900') {
  const phone = `+1${phoneNumberSeed}1111040`;
  const firstTen = phone.substr(0, 10);
  await Promise.all([
    make(
      `microdeposit_notonboarded-${phoneNumberSeed}@dave.com`,
      `${firstTen}40`,
      false,
      false,
      null,
    ),
    make(`microdeposit_failed-${phoneNumberSeed}@dave.com`, `${firstTen}41`, true, false, '0000'),
    make(`microdeposit_required-${phoneNumberSeed}@dave.com`, `${firstTen}42`, true, true, null),
    make(
      `microdeposit_notonboarded_0000-${phoneNumberSeed}@dave.com`,
      `${firstTen}43`,
      false,
      false,
      '0000',
    ),
    make(
      `microdeposit_notonboarded_undefined-${phoneNumberSeed}@dave.com`,
      `${firstTen}44`,
      false,
      false,
      undefined,
    ),
    make(
      `microdeposit_notonboarded_00-${phoneNumberSeed}@dave.com`,
      `${firstTen}45`,
      false,
      false,
      '00',
    ),
    make(
      `microdeposit_notonboarded_000-${phoneNumberSeed}@dave.com`,
      `${firstTen}46`,
      false,
      false,
      '000',
    ),
  ]);
}

async function down(phoneNumberSeed: string = '900') {
  const phone = `+1${phoneNumberSeed}1111040`;
  const firstTen = phone.substr(0, 10);

  await Promise.all([
    deleteUser(`${firstTen}40`),
    deleteUser(`${firstTen}41`),
    deleteUser(`${firstTen}42`),
    deleteUser(`${firstTen}43`),
    deleteUser(`${firstTen}44`),
    deleteUser(`${firstTen}45`),
    deleteUser(`${firstTen}46`),
  ]);
}

async function make(
  email: string,
  phoneNumber: string,
  isOnboarded: boolean,
  microDepositFailed: boolean,
  lastFour: any,
) {
  const now = moment();
  const synapseNodeId = Faker.random.alphaNumeric(20);

  const user = await createUser({
    email,
    phoneNumber,
    synapsepayId: null,
    firstName: path.basename(__filename).split('.')[0],
    lastName: 'Micro Deposit',
    settings: { doNotDisburse: true },
    emailVerified: true,
  });
  const userId = user.id;

  await EmailVerification.update({ verified: now }, { where: { userId } });

  const bankConnection = await factory.create('bank-connection', {
    userId,
    hasValidCredentials: true,
    hasTransactions: isOnboarded,
  });

  const bankAccountFields: Partial<BankAccount> = {
    userId,
    institutionId: bankConnection.institutionId,
    bankConnectionId: bankConnection.id,
    current: 200,
    available: 75,
    synapseNodeId,
  };

  if (isOnboarded && !microDepositFailed) {
    bankAccountFields.microDeposit = MicroDeposit.REQUIRED;
  } else if (microDepositFailed) {
    bankAccountFields.microDeposit = MicroDeposit.FAILED;
  } else {
    bankAccountFields.microDeposit = MicroDeposit.REQUIRED;
    bankAccountFields.accountNumber = null;
    bankAccountFields.lastFour = lastFour;
  }
  bankAccountFields.microDepositCreated = moment().subtract(7, 'days');

  const bankAccount = await factory.create('checking-account', bankAccountFields);
  const bankAccountId = bankAccount.id;

  await user.update({ defaultBankAccountId: bankAccountId });

  if (isOnboarded) {
    await insertOnboardingSteps(userId);
    const paymentMethod = await factory.create('payment-method', {
      bankAccountId: bankAccount.id,
      userId,
    });
    await bankAccount.update({ defaultPaymentMethodId: paymentMethod.id });
  }

  const { recurringTransactionId } = await insertNormalIncomeTransactions(
    userId,
    bankAccountId,
    { name: 'My Profitable Gambling Habit', amount: 100 },
    true,
  );

  await bankAccount.update({ mainPaycheckRecurringTransactionId: recurringTransactionId });

  await insertNormalIncomeTransactions(
    userId,
    bankAccountId,
    { name: 'My Non Profitable Gambling Habit', amount: -50 },
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
