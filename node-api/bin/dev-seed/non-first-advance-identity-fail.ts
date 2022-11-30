import * as path from 'path';
import * as Faker from 'faker';

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
} from './utils';
import { deleteUser } from './delete-user';
import { BankingDataSource } from '@dave-inc/wire-typings';

export async function up(phoneNumberSeed: string = '123') {
  const phone = `+1${phoneNumberSeed}4560900`;
  const firstTen = phone.substr(0, 10);
  await make(`${firstTen}00`);
}

export async function down(phoneNumberSeed: string = '123') {
  const phone = `+1${phoneNumberSeed}4560900`;
  const firstTen = phone.substr(0, 10);

  await deleteUser(`${firstTen}00`);
}

async function make(phoneNumber: string) {
  const synapsepayId = Faker.random.alphaNumeric(20);
  const synapsepayDocId = Faker.random.alphaNumeric(22);

  const user = await createUser({
    phoneNumber,
    synapsepayId,
    firstName: path.basename(__filename).split('.')[0],
    lastName: 'Big money! I just need to verify your identity and email.',
    email: `non-first-advance-identity-fail-${phoneNumber.substr(2, 3)}@dave.com`,
    emailVerified: false,
    settings: { doNotDisburse: true },
  });
  const userId = user.id;

  await factory.create('synapsepay-document-ssn-invalid', {
    userId,
    synapsepayUserId: synapsepayId,
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
  await insertFirstAdvance(
    userId,
    bankAccount.id,
    paymentMethod.id,
    true,
    75,
    moment().subtract(5, 'days'),
  );
}
