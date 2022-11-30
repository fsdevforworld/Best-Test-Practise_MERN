import * as path from 'path';

import * as BankingDataSync from '../../src/domain/banking-data-sync';
import { BalanceLogCaller } from '../../src/typings';
import { moment } from '@dave-inc/time-lib';
import { sequelize } from '../../src/models';
import factory from '../../test/factories';
import { createUser, insertOnboardingSteps, insertSixtyDaysHistory } from './utils';
import { deleteUser } from './delete-user';
import { BankingDataSource } from '@dave-inc/wire-typings';
import * as Faker from 'faker';
import BankingDataClient from '../../src/lib/heath-client';

export async function up(phoneNumberSeed: string = '123') {
  const phone = `+1${phoneNumberSeed}4560300`;
  await make(phone);
}

export async function down(phoneNumberSeed: string = '123') {
  const phone = `+1${phoneNumberSeed}4560300`;
  await deleteUser(phone);
}

async function make(phone: string) {
  //console.log(`Creating user that fails micro advance ${phone}`);
  const now = moment();
  const user = await createUser({
    firstName: path.basename(__filename).split('.')[0],
    lastName: 'No income',
    phoneNumber: phone,
    email: `micro-advance-fail-${phone.substr(2, 3)}@dave.com`,
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

  let txnName = '';
  for (const i of [1, 4, 5]) {
    txnName = `Expense Transaction ${phone}-${i + 1}`;
    const amount = -30;
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
