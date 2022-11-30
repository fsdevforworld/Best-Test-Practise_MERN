import { moment } from '@dave-inc/time-lib';
import { sequelize } from '../../src/models';
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
import BankingDataClient from '../../src/lib/heath-client';

type UserInfo = {
  email?: string;
  expenses?: number[];
  firstName?: string;
  lastName?: string;
  phoneNumber: string;
  hasNoPassword?: boolean;
  requiresPasswordUpdate?: boolean;
};

export async function up(phoneNumberSeed: string = '711') {
  await Promise.all([
    make({
      phoneNumber: `+1${phoneNumberSeed}9110000`,
      firstName: 'UserHasEmailAndPassword',
      lastName: 'Jeff',
      email: `user-has-email-${phoneNumberSeed}@and-password.com`,
    }),
    make({
      phoneNumber: `+1${phoneNumberSeed}9111111`,
      firstName: 'UserHasEmailAndNoPassword',
      lastName: 'Jeff',
      email: `user-has-email-${phoneNumberSeed}@no-password.com`,
      hasNoPassword: true,
    }),
    make({
      phoneNumber: `+1${phoneNumberSeed}9112222`,
      firstName: 'UserNoEmailAndPassword',
      lastName: 'ContractNotChanged',
      hasNoPassword: true,
    }),
    make({
      phoneNumber: `+1${phoneNumberSeed}9112223`,
      firstName: 'UserNoEmailAndPassword',
      lastName: 'ContractNotChanged',
      hasNoPassword: true,
    }),
    make({
      phoneNumber: `+1${phoneNumberSeed}9113333`,
      firstName: 'UserNoEmailAndPassword',
      lastName: 'ContractChanged',
      hasNoPassword: true,
    }),
    make({
      email: `require-credentials-update-${phoneNumberSeed}@breach.com`,
      phoneNumber: `+1${phoneNumberSeed}9114444`,
      firstName: 'UserWithBreachedCredentials',
      lastName: 'RequiresPasswordUpdate',
      requiresPasswordUpdate: true,
    }),
  ]);
}

export async function down(phoneNumberSeed: string = '711') {
  await Promise.all([
    deleteUser(`+1${phoneNumberSeed}9110000`),
    deleteUser(`+1${phoneNumberSeed}9111111`),
    deleteUser(`+1${phoneNumberSeed}9112222`),
    deleteUser(`+1${phoneNumberSeed}9112223`),
    deleteUser(`+1${phoneNumberSeed}9113333`),
    deleteUser(`+1${phoneNumberSeed}9114444`),
  ]);
}

async function make(userInfo: UserInfo) {
  const {
    email,
    expenses = [],
    firstName,
    lastName,
    phoneNumber,
    hasNoPassword,
    requiresPasswordUpdate = false,
  } = userInfo;
  const now = moment();
  const phone = phoneNumber.replace(/\+/, '');
  const synapsepayId = Faker.random.alphaNumeric(20);
  const synapsepayDocId = Faker.random.alphaNumeric(22);
  const synapseNodeId = Faker.random.alphaNumeric(24);

  const user = await createUser({
    email,
    phoneNumber,
    synapsepayId,
    firstName,
    lastName,
    birthdate: '1990-01-01',
    addressLine1: '1265 S Cochran Ave',
    addressLine2: 'The Pit',
    city: 'Los Angeles',
    state: 'CA',
    zipCode: '90019',
    emailVerified: Boolean(email),
    hasNoPassword,
    settings: { doNotDisburse: true },
  });

  const userId = user.id;
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
    current: 40,
    available: 40,
    synapseNodeId,
  });
  const bankAccountId = bankAccount.id;

  if (requiresPasswordUpdate) {
    await sequelize.query(
      `
      UPDATE user
      SET created = '2020-04-29 20:19:39'
      WHERE id = ?
    `,
      { replacements: [userId] },
    );
  }

  await sequelize.query(
    `
    UPDATE user
    SET default_bank_account_id = ?
    WHERE id = ?
  `,
    { replacements: [bankAccountId, userId] },
  );

  const paymentMethod = await factory.create('payment-method', {
    bankAccountId,
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
  await sequelize.query(
    `
    UPDATE bank_account
    SET main_paycheck_recurring_transaction_id = ?
    WHERE id = ?
  `,
    { replacements: [recurringTransactionId, bankAccountId] },
  );

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

  for (const i of expenses) {
    let externalName = `Expense Transaction ${phone}-${i + 1}`;
    let displayName = `Expense Transaction ${phone}-${i + 1}`;
    let externalId = Faker.random.alphaNumeric(24);
    let transactionDate = now
      .clone()
      .subtract(i - 1, 'days')
      .format('YYYY-MM-DD');
    let amount = -100;
    const pending = false;
    await BankingDataClient.createBankTransactions([
      {
        userId,
        bankAccountId,
        externalName,
        displayName,
        externalId,
        amount,
        transactionDate,
        pending,
      },
    ]);

    externalName = `Income Transaction ${phone}-${i + 1}`;
    displayName = `Income Transaction ${phone}-${i + 1}`;
    externalId = Faker.random.alphaNumeric(24);
    transactionDate = now
      .clone()
      .subtract(i, 'days')
      .format('YYYY-MM-DD');
    amount = -1 * amount;
    await BankingDataClient.createBankTransactions([
      {
        userId,
        bankAccountId,
        externalName,
        displayName,
        externalId,
        amount,
        transactionDate,
        pending,
      },
    ]);
  }

  await insertSixtyDaysHistory(userId, bankAccountId);
  await BankingDataSync.backfillDailyBalances(
    bankAccount,
    BalanceLogCaller.BinDevSeed,
    BankingDataSource.Plaid,
  );
}
