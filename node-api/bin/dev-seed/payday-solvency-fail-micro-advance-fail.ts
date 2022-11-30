import * as path from 'path';

import * as BankingDataSync from '../../src/domain/banking-data-sync';
import { BalanceLogCaller } from '../../src/typings';
import { moment } from '@dave-inc/time-lib';
import { sequelize } from '../../src/models';
import factory from '../../test/factories';
import {
  createUser,
  insertNormalIncomeTransactions,
  insertOnboardingSteps,
  insertSixtyDaysHistory,
} from './utils';
import { deleteUser } from './delete-user';
import { BankingDataSource } from '@dave-inc/wire-typings';
import * as Faker from 'faker';
import BankingDataClient from '../../src/lib/heath-client';

export async function up(phoneNumberSeed: string = '123') {
  const phone = `+1${phoneNumberSeed}4560500`;
  await make(phone);
}

export async function down(phoneNumberSeed: string = '123') {
  const phone = `+1${phoneNumberSeed}4560500`;
  await deleteUser(phone);
}

async function make(phone: string) {
  //console.log(`Creating user that fails historical solvency and micro advance ${phone}`);
  const now = moment();
  const user = await createUser({
    firstName: path.basename(__filename).split('.')[0],
    lastName: 'Micro advance fail',
    phoneNumber: phone,
    email: `payday-solvency-fail-micro-advance-fail-${phone.substr(2, 3)}@dave.com`,
    emailVerified: true,
    settings: { doNotDisburse: true },
  });
  const userId = user.id;

  await insertOnboardingSteps(userId);

  const bankConnection = await factory.create('bank-connection', {
    userId,
    hasValidCredentials: true,
    hasTransactions: true,
  });

  const bankAccount = await factory.create('checking-account', {
    userId,
    institutionId: bankConnection.institutionId,
    bankConnectionId: bankConnection.id,
    current: 10,
    available: 10,
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

  const { recurringTransactionId } = await insertNormalIncomeTransactions(
    userId,
    bankAccountId,
    { name: 'My Profitable Gambling Habit', amount: 400 },
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

  for (let i = 0; i < 3; i++) {
    let externalName = `Expense Transaction ${phone}-${i + 1}`;
    let displayName = `Expense Transaction ${phone}-${i + 1}`;
    let externalId = Faker.random.alphaNumeric(24);
    let transactionDate = now
      .clone()
      .subtract(i, 'days')
      .format('YYYY-MM-DD');
    let amount = -10;
    const pending = false;
    externalName = `Income Transaction ${phone}-${i + 1}`;
    displayName = `Income Transaction ${phone}-${i + 1}`;
    externalId = Faker.random.alphaNumeric(24);
    transactionDate = now
      .clone()
      .subtract(i + 1, 'days')
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
