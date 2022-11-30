import * as path from 'path';
import * as Faker from 'faker';

import * as BankingDataSync from '../../src/domain/banking-data-sync';
import { BalanceLogCaller } from '../../src/typings';
import { moment } from '@dave-inc/time-lib';
import { sequelize, User } from '../../src/models';
import factory from '../../test/factories';
import {
  createUser,
  insertNormalIncomeTransactions,
  insertOnboardingSteps,
  insertSixtyDaysHistory,
} from './utils';
import { isBankingDay } from '../../src/lib/banking-days';
import { Moment } from 'moment';
import { RecurringTransactionStatus } from '../../src/typings';
import { deleteUser } from './delete-user';
import { BankingDataSource } from '@dave-inc/wire-typings';

export async function up(phoneNumberSeed: string = '123') {
  const phone = `+1${phoneNumberSeed}4560600`;
  const firstTen = phone.substr(0, 10);
  let phoneNumber = `${firstTen}00`;
  const daysUntilNextPaycheck = 14;
  let nextPaycheckDate = moment()
    .add(daysUntilNextPaycheck + 1, 'days')
    .startOf('day');
  while (!isBankingDay(nextPaycheckDate)) {
    nextPaycheckDate.add(1, 'days');
  }
  //console.log(`Creating normal dev user with failing income rules with paycheck date more than ${daysUntilNextPaycheck} days away ${phoneNumber}`);
  await make(
    phoneNumber,
    `income-engine-fail1-${phoneNumberSeed}@dave.com`,
    nextPaycheckDate,
    `Valid paycheck date is more than ${daysUntilNextPaycheck} (${nextPaycheckDate.format(
      'YYYY-MM-DD',
    )}) days away.`,
    RecurringTransactionStatus.VALID,
    false,
    'MONTHLY',
  );

  phoneNumber = `${firstTen}01`;
  nextPaycheckDate = moment().startOf('day');
  //console.log(`Creating normal dev user with failing income rules with paycheck date being today ${phoneNumber}`);
  await make(
    phoneNumber,
    `income-engine-fail2-${phoneNumberSeed}@dave.com`,
    nextPaycheckDate,
    'Valid paycheck date is today.',
  );

  phoneNumber = `${firstTen}02`;
  await make(
    phoneNumber,
    `income-engine-fail3-${phoneNumberSeed}@dave.com`,
    null,
    'Skip validity check. Pass Tinymoney',
    RecurringTransactionStatus.NOT_VALIDATED,
    false,
  );

  phoneNumber = `${firstTen}03`;
  await make(
    phoneNumber,
    `income-engine-fail4-${phoneNumberSeed}@dave.com`,
    null,
    'missed income. Pass Tinymoney',
    RecurringTransactionStatus.VALID,
    true,
  );
}

export async function down(phoneNumberSeed: string = '123') {
  const phone = `+1${phoneNumberSeed}4560600`;
  const firstTen = phone.substr(0, 10);

  await deleteUser(`${firstTen}00`);
  await deleteUser(`${firstTen}01`);
  await deleteUser(`${firstTen}02`);
  await deleteUser(`${firstTen}03`);
}

export async function make(
  phoneNumber: string,
  email: string,
  nextPaycheckDate: Moment,
  reason: string,
  status = RecurringTransactionStatus.VALID,
  missed = false,
  period = 'BIWEEKLY',
): Promise<User> {
  const unique = phoneNumber.replace(/[^\d]+/g, '');

  const synapsepayId = Faker.random.alphaNumeric(24).substring(17) + unique;
  const synapseNodeId = Faker.random.alphaNumeric(24).substring(17) + unique;

  const user = await createUser({
    phoneNumber,
    synapsepayId,
    firstName: path.basename(__filename).split('.')[0],
    lastName: 'Tiny money! ' + reason,
    email,
    emailVerified: true,
    settings: { doNotDisburse: true },
    zipCode: '90019',
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
    synapseNodeId,
    current: 3000,
    available: 3000,
  });
  await sequelize.query(
    `
        UPDATE user
        SET default_bank_account_id = ?
        WHERE id = ?
    `,
    { replacements: [bankAccount.id, userId] },
  );

  await factory.create('payment-method', {
    bankAccountId: bankAccount.id,
    userId,
  });

  const { recurringTransactionId } = await insertNormalIncomeTransactions(
    userId,
    bankAccount.id,
    {
      name: 'My Profitable Gambling Habit',
      date: nextPaycheckDate,
      status,
      missed: missed ? moment().format('YYYY-MM-DD H:m:s') : null,
      period,
    },
    true,
  );
  await sequelize.query(
    `
        UPDATE bank_account
        SET main_paycheck_recurring_transaction_id = ?
        WHERE id = ?
    `,
    { replacements: [recurringTransactionId, bankAccount.id] },
  );

  await insertSixtyDaysHistory(userId, bankAccount.id);
  await BankingDataSync.backfillDailyBalances(
    bankAccount,
    BalanceLogCaller.BinDevSeed,
    BankingDataSource.Plaid,
  );
  return user.reload();
}
