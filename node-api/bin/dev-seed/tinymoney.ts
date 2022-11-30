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
import factory from '../../test/factories';
import { deleteUser } from './delete-user';
import { BankingDataSource } from '@dave-inc/wire-typings';
import * as Faker from 'faker';

async function up(phoneNumberSeed: string = '900') {
  const phone = `+1${phoneNumberSeed}1111110`;
  const firstTen = phone.substr(0, 10);
  await Promise.all([
    make(`tiny-money-email-verified-${phoneNumberSeed}@dave.com`, `${firstTen}10`, 10, false),
    make(`tiny-money-email-verified1-${phoneNumberSeed}@dave.com`, `${firstTen}11`, 10, false),
    make(`tiny-money-default-tip-0-${phoneNumberSeed}@dave.com`, `${firstTen}12`, 0, false),
    make(`tiny-money-default-tip-0-0-${phoneNumberSeed}@dave.com`, `${firstTen}13`, 0, false),
    make(`tiny-money-default-tip-5-${phoneNumberSeed}@dave.com`, `${firstTen}14`, 5, false),
    make(`tiny-money-default-tip-20-${phoneNumberSeed}@dave.com`, `${firstTen}15`, 20, false),
    make(`tiny-money-default-tip-15-${phoneNumberSeed}@dave.com`, `${firstTen}16`, 15, false),
    make(`tiny-money-second-paycheck1-${phoneNumberSeed}@dave.com`, `${firstTen}17`, 15, true),
  ]);
}

async function down(phoneNumberSeed: string = '900') {
  const phone = `+1${phoneNumberSeed}1111110`;
  const firstTen = phone.substr(0, 10);

  await Promise.all([
    deleteUser(`${firstTen}10`),
    deleteUser(`${firstTen}11`),
    deleteUser(`${firstTen}12`),
    deleteUser(`${firstTen}13`),
    deleteUser(`${firstTen}14`),
    deleteUser(`${firstTen}15`),
    deleteUser(`${firstTen}16`),
    deleteUser(`${firstTen}17`),
  ]);
}

async function make(
  email: string,
  phoneNumber: string,
  defaultTip: number,
  secondPaycheck: boolean,
) {
  //console.log(`Creating new user with ${email} ${phoneNumber}`);
  const now = moment();
  const synapsepayId = Faker.random.alphaNumeric(20);
  const synapsepayDocId = Faker.random.alphaNumeric(22);
  const synapseNodeId = Faker.random.alphaNumeric(24);

  const user = await createUser({
    email,
    phoneNumber,
    synapsepayId,
    firstName: path.basename(__filename).split('.')[0],
    lastName: 'UI Test for Tiny money with verified email',
    settings: { default_tip: defaultTip, doNotDisburse: true },
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
    current: 300,
    available: 150,
    synapseNodeId,
  });
  const bankAccountId = bankAccount.id;

  await user.update({ defaultBankAccountId: bankAccountId });

  const paymentMethod = await factory.create('payment-method', {
    bankAccountId: bankAccount.id,
    userId,
  });

  await bankAccount.update({ defaultPaymentMethodId: paymentMethod.id });

  await insertOnboardingSteps(userId);

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

  if (secondPaycheck === true) {
    await insertNormalIncomeTransactions(
      userId,
      bankAccountId,
      { name: 'My Profitable Gambling Habit 2', amount: 2500, date },
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

export { up, down };
