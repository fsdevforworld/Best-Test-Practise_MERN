// income validation engine
// missed-income
// income-skip-validity-check
//

// payday-solvency-engine
// historical-payday-solvency
//

import * as path from 'path';

import { BalanceLogCaller } from '../../src/typings';
import { moment } from '@dave-inc/time-lib';
import { sequelize } from '../../src/models';
import factory from '../../test/factories';
import * as BankingDataSync from '../../src/domain/banking-data-sync';
import {
  createUser,
  insert,
  insertOnboardingSteps,
  insertSixtyDaysHistory,
  upsertDailyBalanceLogToQualifyFor75,
  createInternalUser,
} from './utils';
import { deleteUser } from './delete-user';
import { BankingDataSource } from '@dave-inc/wire-typings';

export async function up(phoneNumberSeed: string = '123') {
  const phone = `+1${phoneNumberSeed}4561500`;
  const firstTen = phone.substr(0, 10);
  // historical payday solvency fail but admin override
  await make(`${firstTen}00`, `admin-overrides1-${phoneNumberSeed}@dave.com`, true);
  await make(`${firstTen}01`, `admin-overrides2-${phoneNumberSeed}@dave.com`, false);
  await make(`${firstTen}02`, `admin-overrides3-${phoneNumberSeed}@dave.com`, false);
}

export async function down(phoneNumberSeed: string = '123') {
  const phone = `+1${phoneNumberSeed}4561500`;
  const firstTen = phone.substr(0, 10);

  await deleteUser(`${firstTen}00`);
  await deleteUser(`${firstTen}01`);
  await deleteUser(`${firstTen}02`);
}

async function make(phone: string, email: string, solvency: boolean) {
  const user = await createUser({
    firstName: path.basename(__filename).split('.')[0],
    lastName: 'Johnson',
    phoneNumber: phone,
    email,
    emailVerified: true,
    settings: { doNotDisburse: true },
  });
  const internalUser = await createInternalUser();
  const userId = user.id;

  await insertOnboardingSteps(userId);

  const bankConnection = await factory.create('bank-connection', {
    userId,
    hasValidCredentials: true,
    hasTransactions: true,
  });

  let balance = 200;
  if (solvency) {
    balance = 10;
  }

  const bankAccount = await factory.create('checking-account', {
    userId,
    institutionId: bankConnection.institutionId,
    bankConnectionId: bankConnection.id,
    current: balance,
    available: balance,
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

  const amount = 500;

  const payDate = moment()
    .add(5, 'day')
    .format('YYYY-MM-DD');
  await insert('admin_paycheck_override', {
    userId,
    bankAccountId,
    amount,
    payDate,
    creatorId: internalUser.id,
  });

  await insertSixtyDaysHistory(userId, bankAccountId);
  await BankingDataSync.backfillDailyBalances(
    bankAccount,
    BalanceLogCaller.BinDevSeed,
    BankingDataSource.Plaid,
  );
  await upsertDailyBalanceLogToQualifyFor75(bankAccount);
}
