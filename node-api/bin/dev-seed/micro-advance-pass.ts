import * as path from 'path';

import { moment } from '@dave-inc/time-lib';
import { sequelize } from '../../src/models';
import * as BankingDataSync from '../../src/domain/banking-data-sync';
import { BalanceLogCaller } from '../../src/typings';
import factory from '../../test/factories';
import { createUser, insert, insertOnboardingSteps, insertSixtyDaysHistory } from './utils';
import { deleteUser } from './delete-user';
import { BankingDataSource } from '@dave-inc/wire-typings';
import * as Faker from 'faker';
import BankingDataClient from '../../src/lib/heath-client';

async function up(phoneNumberSeed: string = '123') {
  const phone = `+1${phoneNumberSeed}4560200`;
  const firstTen = phone.substr(0, 10);
  await make(`dev-advance5-${phoneNumberSeed}@dave.com`, `${firstTen}00`, [2, 4]);
  await make(`dev-advance5-10-${phoneNumberSeed}@dave.com`, `${firstTen}01`, [2, 4, 6]);
  await make(`dev-advance5-10-15-${phoneNumberSeed}@dave.com`, `${firstTen}02`, [2, 4, 6, 9]);
}

async function down(phoneNumberSeed: string = '123') {
  const phone = `+1${phoneNumberSeed}4560200`;
  const firstTen = phone.substr(0, 10);

  await deleteUser(`${firstTen}00`);
  await deleteUser(`${firstTen}01`);
  await deleteUser(`${firstTen}02`);
}

async function make(email: string, phoneNumber: string, expenses: number[]) {
  //console.log(`Creating new user with ${email} ${phoneNumber}`);
  const now = moment();
  const phone = phoneNumber.replace(/\+/, '');
  const synapsepayId = Faker.random.alphaNumeric(20);
  const synapseNodeId = Faker.random.alphaNumeric(22);

  const user = await createUser({
    email,
    phoneNumber,
    synapsepayId,
    firstName: path.basename(__filename).split('.')[0],
    lastName: 'Tiny money!',
    settings: { default_tip: 10, doNotDisburse: true },
    emailVerified: true,
  });
  const userId = user.id;
  await insert('email_verification', { userId, email });

  const bankConnection = await factory.create('bank-connection', {
    userId,
    hasValidCredentials: true,
    hasTransactions: true,
  });
  const bankAccount = await factory.create('checking-account', {
    userId,
    institutionId: bankConnection.institutionId,
    bankConnectionId: bankConnection.id,
    current: 0,
    available: 0,
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

  await factory.create('payment-method', { bankAccountId, userId });
  await factory.create('synapsepay-document', { userId });

  await insertOnboardingSteps(userId);

  let txnName: string;
  for (const i of expenses) {
    txnName = `Expense Transaction ${phone}-${i + 1}`;
    const amount: number = -55;
    await BankingDataClient.createBankTransactions([
      {
        userId,
        bankAccountId,
        externalName: txnName,
        displayName: txnName,
        externalId: Faker.random.alphaNumeric(24),
        amount,
        transactionDate: now
          .clone()
          .subtract(i, 'days')
          .format('YYYY-MM-DD'),
        pending: true,
      },
    ]);
    txnName = `Income Transaction ${phone}-${i + 1}`;
    await BankingDataClient.createBankTransactions([
      {
        userId,
        bankAccountId,
        externalName: txnName,
        displayName: txnName,
        externalId: Faker.random.alphaNumeric(24),
        amount: -1 * amount,
        transactionDate: now
          .clone()
          .subtract(i + 1, 'days')
          .format('YYYY-MM-DD'),
        pending: true,
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
