import * as path from 'path';

import { EmailVerification } from '../../src/models';
import { moment } from '@dave-inc/time-lib';
import * as BankingDataSync from '../../src/domain/banking-data-sync';
import { BalanceLogCaller } from '../../src/typings';
import { createUser, insertOnboardingSteps, insertSixtyDaysHistory } from './utils';
import factory from '../../test/factories';
import { deleteUser } from './delete-user';
import { BankingDataSource } from '@dave-inc/wire-typings';
import * as Faker from 'faker';

async function up(phoneNumberSeed: string = '900') {
  const phone = `+1${phoneNumberSeed}8979213`;
  const firstTen = phone.substr(0, 10);
  await Promise.all([
    make(`missed-paycheck13-${phoneNumberSeed}@dave.com`, `${firstTen}13`),
    make(`missed-paycheck14-${phoneNumberSeed}@dave.com`, `${firstTen}14`),
    make(`missed-paycheck15-${phoneNumberSeed}@dave.com`, `${firstTen}15`),
  ]);
}

async function down(phoneNumberSeed: string = '900') {
  const phone = `+1${phoneNumberSeed}8979213`;
  const firstTen = phone.substr(0, 10);

  await Promise.all([
    deleteUser(`${firstTen}13`),
    deleteUser(`${firstTen}14`),
    deleteUser(`${firstTen}15`),
  ]);
}

async function make(email: string, phoneNumber: string) {
  const now = moment();
  const synapsepayId = Faker.random.alphaNumeric(20);
  const synapsepayDocId = Faker.random.alphaNumeric(22);
  const synapseNodeId = Faker.random.alphaNumeric(24);

  const user = await createUser({
    email,
    phoneNumber,
    synapsepayId,
    firstName: path.basename(__filename).split('.')[0],
    lastName: 'payday solvency fail',
    emailVerified: true,
  });
  const userId = user.id;

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

  const bankAccount = await factory.create('checking-account', {
    userId,
    institutionId: bankConnection.institutionId,
    bankConnectionId: bankConnection.id,
    current: 1400,
    available: 1400,
    synapseNodeId,
  });
  const bankAccountId = bankAccount.id;

  await user.update({ defaultBankAccountId: bankAccountId });

  await factory.create('payment-method', {
    bankAccountId,
    userId,
  });

  const paymentMethod = await factory.create('payment-method', {
    bankAccountId: bankAccount.id,
    userId,
  });

  await bankAccount.update({ defaultPaymentMethodId: paymentMethod.id });

  await insertOnboardingSteps(userId);

  const missedIncomeDate = moment()
    .startOf('month')
    .format('YYYY-MM-DD');

  await factory.create('recurring-transaction', {
    userId,
    bankAccountId,
    transactionDisplayName: 'Missed Income',
    interval: 'MONTHLY',
    params: [1],
    userAmount: 2000,
    missed: missedIncomeDate,
  });

  await factory.create('bank-transaction', {
    userId,
    bankAccountId,
    displayName: 'First Recurring Income transaction',
    date: moment()
      .subtract(2, 'months')
      .startOf('month')
      .format('YYYY-MM-DD'),
  });

  await factory.create('bank-transaction', {
    userId,
    bankAccountId,
    displayName: 'Second recurring income transaction',
    date: moment()
      .subtract(1, 'months')
      .startOf('month')
      .format('YYYY-MM-DD'),
  });

  await insertSixtyDaysHistory(userId, bankAccountId);
  await BankingDataSync.backfillDailyBalances(
    bankAccount,
    BalanceLogCaller.BinDevSeed,
    BankingDataSource.Plaid,
  );
}

export { up, down };
