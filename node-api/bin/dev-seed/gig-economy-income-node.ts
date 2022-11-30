import * as path from 'path';

import { moment } from '@dave-inc/time-lib';
import { sequelize } from '../../src/models';
import * as BankingDataSync from '../../src/domain/banking-data-sync';
import { BalanceLogCaller } from '../../src/typings';
import factory from '../../test/factories';
import { createUser, insert, insertOnboardingSteps, insertSixtyDaysHistory } from './utils';
import * as Bluebird from 'bluebird';
import { deleteUser } from './delete-user';
import { BankingDataSource } from '@dave-inc/wire-typings';
import * as Faker from 'faker';
import BankingDataClient from '../../src/lib/heath-client';

async function up(phoneNumberSeed: string = '123') {
  const phone = `+1${phoneNumberSeed}4321200`;
  const firstTen = phone.substr(0, 10);
  await make(
    `dev-gig-economy-1-${phoneNumberSeed}@dave.com`,
    `${firstTen}00`,
    [1, 1, 3, 8, 9],
    'wow Uber',
  );
  await make(
    `dev-gig-economy-2-${phoneNumberSeed}@dave.com`,
    `${firstTen}01`,
    [2, 2, 2, 6, 7, 13],
    'Lyft bacon and cheese',
  );
  await make(`dev-gig-economy-3-${phoneNumberSeed}@dave.com`, `${firstTen}02`, [2, 6], 'Raiser');
  await make(`dev-gig-economy-4-${phoneNumberSeed}@dave.com`, `${firstTen}03`, [10, 13], 'Raiser');
  await make(`dev-gig-economy-5-${phoneNumberSeed}@dave.com`, `${firstTen}04`, [3, 13], 'Uber');
  await make(
    `dev-gig-economy-2a-${phoneNumberSeed}@dave.com`,
    `${firstTen}05`,
    [2, 6, 7, 13],
    'Lyft bacon and cheese',
    10,
  );
  await make(
    `dev-gig-economy-2b-${phoneNumberSeed}@dave.com`,
    `${firstTen}06`,
    [2, 6, 7, 13],
    'Lyft bacon and cheese',
    50,
  );
  await make(
    `dev-gig-economy-07-${phoneNumberSeed}@dave.com`,
    `${firstTen}07`,
    [1, 1, 3, 8, 9],
    'amazon returns',
  );
  await make(
    `dev-gig-economy-08-${phoneNumberSeed}@dave.com`,
    `${firstTen}08`,
    [1, 1, 3, 8, 9],
    'postmates',
  );
  await make(
    `dev-gig-economy-09-${phoneNumberSeed}@dave.com`,
    `${firstTen}09`,
    [2, 2, 2, 6, 7, 13],
    'instacart',
  );
}

async function down(phoneNumberSeed: string = '123') {
  const phone = `+1${phoneNumberSeed}4321200`;
  const firstTen = phone.substr(0, 10);

  await deleteUser(`${firstTen}00`);
  await deleteUser(`${firstTen}01`);
  await deleteUser(`${firstTen}02`);
  await deleteUser(`${firstTen}03`);
  await deleteUser(`${firstTen}04`);
  await deleteUser(`${firstTen}05`);
  await deleteUser(`${firstTen}06`);
  await deleteUser(`${firstTen}07`);
  await deleteUser(`${firstTen}08`);
  await deleteUser(`${firstTen}09`);
}

async function make(
  email: string,
  phoneNumber: string,
  incomes: number[],
  gigIncomeName: string,
  bankAmount: number = 200,
) {
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
    current: bankAmount,
    available: bankAmount,
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

  let txnName;
  for (const i of [2, 4]) {
    txnName = `Expense Transaction ${phone}-${i + 1}`;
    const amount = -55;
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

  await Bluebird.map(incomes, daysAgo => {
    return BankingDataClient.createBankTransactions([
      {
        userId,
        bankAccountId,
        externalName: gigIncomeName,
        displayName: gigIncomeName,
        externalId: gigIncomeName + daysAgo + Math.random() * 1000,
        amount: 50,
        transactionDate: now
          .clone()
          .subtract(daysAgo, 'days')
          .format('YYYY-MM-DD'),
        pending: false,
      },
    ]);
  });

  await insertSixtyDaysHistory(userId, bankAccountId);
  await BankingDataSync.backfillDailyBalances(
    bankAccount,
    BalanceLogCaller.BinDevSeed,
    BankingDataSource.Plaid,
  );
}

export { up, down };
