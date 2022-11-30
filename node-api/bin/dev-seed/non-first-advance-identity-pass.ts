import * as path from 'path';

import * as BankingDataSync from '../../src/domain/banking-data-sync';
import { BalanceLogCaller } from '../../src/typings';
import { moment } from '@dave-inc/time-lib';
import { sequelize } from '../../src/models';
import factory from '../../test/factories';
import {
  createUser,
  insertFirstAdvance,
  insertNormalIncomeTransactions,
  insertOnboardingSteps,
  insertSixtyDaysHistory,
  upsertDailyBalanceLogToQualifyFor75,
} from './utils';
import { deleteUser } from './delete-user';
import { BankingDataSource } from '@dave-inc/wire-typings';
import * as Faker from 'faker';

type makeOpts = {
  phoneNumber?: string;
  synapsepayUserId?: string;
  synapsepayNodeId?: string;
  synapsepayDocId?: string;
  userId?: number;
  email?: string;
};

export async function up(phoneNumberSeed: string = '123', opts: makeOpts) {
  await make(phoneNumberSeed, opts);
}

export async function down(phoneNumberSeed: string = '123') {
  await deleteUser(`+1${phoneNumberSeed}4561000`);
}

async function make(
  phoneNumberSeed: string,
  {
    phoneNumber = `+1${phoneNumberSeed}4561000`,
    email = `non-first-advance-identity-pass-${phoneNumber.substr(2, 3)}@dave.com`,
    userId,
    synapsepayUserId = Faker.random.alphaNumeric(20),
    synapsepayNodeId = Faker.random.alphaNumeric(22),
    synapsepayDocId = Faker.random.alphaNumeric(24),
  }: makeOpts = {},
) {
  const user = await createUser({
    phoneNumber,
    id: userId,
    synapsepayId: synapsepayUserId,
    firstName: path.basename(__filename).split('.')[0],
    lastName: "Big money! Hi, let's verify your email.",
    email,
    emailVerified: true,
    settings: { doNotDisburse: true },
  });

  userId = user.id;

  await factory.create('synapsepay-document', {
    userId,
    synapsepayUserId,
    synapsepayDocId,
    phoneNumber,
  });

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
    synapseNodeId: synapsepayNodeId,
    current: 300,
    available: 300,
  });

  await sequelize.query(
    `
    UPDATE user
    SET default_bank_account_id = ?
    WHERE id = ?
  `,
    { replacements: [bankAccount.id, userId] },
  );

  const paymentMethod = await factory.create('payment-method', {
    bankAccountId: bankAccount.id,
    userId,
  });

  await bankAccount.update({ defaultPaymentMethodId: paymentMethod.id });

  const { recurringTransactionId } = await insertNormalIncomeTransactions(
    userId,
    bankAccount.id,
    { name: 'My Profitable Gambling Habit' },
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
  await upsertDailyBalanceLogToQualifyFor75(bankAccount, moment().subtract(8, 'day'));
  await insertFirstAdvance(
    userId,
    bankAccount.id,
    paymentMethod.id,
    true,
    75,
    moment().subtract(5, 'days'),
  );
}
