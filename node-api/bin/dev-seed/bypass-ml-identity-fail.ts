import * as path from 'path';

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

async function up(phoneNumberSeed: string = '123') {
  const phone = `+1${phoneNumberSeed}4561400`;
  const firstTen = phone.substr(0, 10);
  await make(
    `solvency-fail-dev-advance5-bypass-ml-idenity-${phoneNumberSeed}@dave.com`,
    `${firstTen}00`,
    [2, 10],
  );
}

async function down(phoneNumberSeed: string = '123') {
  const phone = `+1${phoneNumberSeed}4561400`;
  const firstTen = phone.substr(0, 10);

  await deleteUser(`${firstTen}00`);
}

async function make(email: string, phoneNumber: string, expenses: any[]) {
  //console.log(`Creating new user with ${email} ${phoneNumber}`);
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
    lastName: 'Tiny money! I just need to verify your identity and email.',
    bypassMl: true,
    emailVerified: false,
    settings: { doNotDisburse: true },
  });
  const userId = user.id;
  await factory.create('synapsepay-document-ssn-invalid', {
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
  await sequelize.query(
    `
    UPDATE user
    SET default_bank_account_id = ?
    WHERE id = ?
  `,
    { replacements: [bankAccountId, userId] },
  );

  await factory.create('payment-method', {
    bankAccountId,
    userId,
  });

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

export { up, down };