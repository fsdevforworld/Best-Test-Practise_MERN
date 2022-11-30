import * as path from 'path';

import { EmailVerification } from '../../src/models';
import { moment } from '@dave-inc/time-lib';
import * as BankingDataSync from '../../src/domain/banking-data-sync';
import { BalanceLogCaller } from '../../src/typings';
import { createUser, insertNormalIncomeTransactions, insertSixtyDaysHistory } from './utils';
import { Moment } from 'moment';
import factory from '../../test/factories';
import { deleteUser } from './delete-user';
import { BankingDataSource } from '@dave-inc/wire-typings';
import * as Faker from 'faker';

async function up(phoneNumberSeed: string = '900') {
  const phone = `+1${phoneNumberSeed}1110060`;
  const firstTen = phone.substr(0, 10);
  await Promise.all([
    make(`deleteduser-${phoneNumberSeed}@dave.com`, `${firstTen}60`, moment(), true, false),
    make(
      `deleteduser1-${phoneNumberSeed}@dave.com`,
      `${firstTen}61-deleted`,
      moment().subtract(62, 'days'),
      true,
      false,
    ),
    make(`deleteduser2-${phoneNumberSeed}@dave.com`, `${firstTen}62-deleted`, moment(), true, true),
    make(
      `deleteduser3-${phoneNumberSeed}@dave.com`,
      `${firstTen}63-deleted`,
      moment(),
      false,
      true,
    ),
  ]);
}

async function down(phoneNumberSeed: string = '900') {
  const phone = `+1${phoneNumberSeed}1110060`;
  const firstTen = phone.substr(0, 10);

  await Promise.all([
    deleteUser(`${firstTen}60`),
    deleteUser(`${firstTen}61`),
    deleteUser(`${firstTen}61-deleted`),
    deleteUser(`${firstTen}62-deleted`),
    deleteUser(`${firstTen}63-deleted`),
  ]);
}

async function make(
  email: string,
  phoneNumber: string,
  deletedOnDate: Moment,
  emailVerified: boolean,
  overrideSixtyDayDelete: boolean,
) {
  const now = moment();
  const synapsepayId = Faker.random.alphaNumeric(20);
  const synapsepayDocId = Faker.random.alphaNumeric(22);
  const synapseNodeId = Faker.random.alphaNumeric(24);

  const user = await createUser({
    email,
    phoneNumber,
    synapsepayId,
    firstName: path.basename(__filename).split('.')[0],
    lastName: 'Deleted User',
    settings: { default_tip: 10, doNotDisburse: true },
    emailVerified,
    deleted: deletedOnDate,
    overrideSixtyDayDelete,
  });
  const userId = user.id;

  await factory.create('delete-request', { userId: user.id });

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

  const checkingAccount1 = await factory.create('checking-account', {
    userId,
    institutionId: bankConnection.institutionId,
    bankConnectionId: bankConnection.id,
    displayName: 'Checking Account One',
    current: 1400,
    available: 1400,
    synapseNodeId,
  });

  const bankAccountId = checkingAccount1.id;

  await user.update({ defaultBankAccountId: bankAccountId });

  await factory.create('payment-method', {
    bankAccountId,
    userId,
  });

  const { recurringTransactionId } = await insertNormalIncomeTransactions(
    userId,
    bankAccountId,
    { name: 'My Profitable Gambling Habit', amount: 500 },
    true,
  );

  await checkingAccount1.update({ mainPaycheckRecurringTransactionId: recurringTransactionId });

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

  await insertSixtyDaysHistory(userId, bankAccountId);
  await BankingDataSync.backfillDailyBalances(
    checkingAccount1,
    BalanceLogCaller.BinDevSeed,
    BankingDataSource.Plaid,
  );
}

export { up, down };
