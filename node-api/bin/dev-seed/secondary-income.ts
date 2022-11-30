import * as path from 'path';

import { moment } from '@dave-inc/time-lib';
import * as BankingDataSync from '../../src/domain/banking-data-sync';
import { BalanceLogCaller } from '../../src/typings';
import {
  createUser,
  insertNormalIncomeTransactions,
  insertOnboardingSteps,
  insertSixtyDaysHistory,
  upsertDailyBalanceLogToQualifyFor75,
} from './utils';
import factory from '../../test/factories';
import * as Bluebird from 'bluebird';
import { MINIMUM_APPROVAL_PAYCHECK_AMOUNT } from '../../src/services/advance-approval/advance-approval-engine';
import { deleteUser } from './delete-user';
import { BankingDataSource } from '@dave-inc/wire-typings';
import * as Faker from 'faker';
import BankingDataClient from '../../src/lib/heath-client';

async function up(phoneNumberSeed: string = '123') {
  const phone = `+1${phoneNumberSeed}4577777`;
  await make(`secondary-income-${phoneNumberSeed}@dave.com`, phone, [2, 9]);
}

async function down(phoneNumberSeed: string = '123') {
  const phone = `+1${phoneNumberSeed}4577777`;
  await deleteUser(phone);
}

async function make(email: string, phoneNumber: string, expenses: number[]) {
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
    lastName: 'Tiny money! Fails solvency test for big money.',
    bypassMl: true,
    emailVerified: true,
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
    current: 150,
    available: 150,
    synapseNodeId,
  });
  const bankAccountId = bankAccount.id;
  const paymentMethod = await factory.create('payment-method', {
    bankAccountId,
    userId,
  });

  const date = moment().add(4, 'days');
  const { recurringTransactionId } = await insertNormalIncomeTransactions(
    userId,
    bankAccountId,
    { name: 'My Non Profitable Gambling Habit 2', amount: 20, date },
    true,
  );

  const promises: Array<PromiseLike<any>> = [
    insertOnboardingSteps(userId),
    bankAccount.update({ defaultPaymentMethodId: paymentMethod.id }),
    insertNormalIncomeTransactions(
      userId,
      bankAccountId,
      { name: 'My Profitable Gambling Habit', amount: 500 },
      true,
    ),
    insertNormalIncomeTransactions(
      userId,
      bankAccountId,
      { name: 'Bacon Sales', amount: 500 },
      true,
    ),
    insertNormalIncomeTransactions(
      userId,
      bankAccountId,
      { name: 'My Non Profitable Gambling Habit', amount: -500 },
      false,
    ),
    bankAccount.update({ mainPaycheckRecurringTransactionId: recurringTransactionId }),
    user.update({ defaultBankAccountId: bankAccountId }),
  ];
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
    promises.push(
      BankingDataClient.createBankTransactions([
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
      ]),
    );
    externalName = `Income Transaction ${phone}-${i + 1}`;
    displayName = `Income Transaction ${phone}-${i + 1}`;
    externalId = Faker.random.alphaNumeric(24);
    transactionDate = now
      .clone()
      .subtract(i, 'days')
      .format('YYYY-MM-DD');
    amount = -1 * MINIMUM_APPROVAL_PAYCHECK_AMOUNT;
    promises.push(
      BankingDataClient.createBankTransactions([
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
      ]),
    );
  }

  promises.push(insertSixtyDaysHistory(userId, bankAccountId));
  promises.push(
    BankingDataSync.backfillDailyBalances(
      bankAccount,
      BalanceLogCaller.BinDevSeed,
      BankingDataSource.Plaid,
    ),
  );

  await Bluebird.all(promises);

  await upsertDailyBalanceLogToQualifyFor75(bankAccount);
}

export { up, down };
