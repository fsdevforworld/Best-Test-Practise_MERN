import * as path from 'path';
import * as Faker from 'faker';
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

export async function up(phoneNumberSeed: string = '123') {
  const phone = `+1${phoneNumberSeed}4560100`;
  const firstTen = phone.substr(0, 10);

  await make(`${firstTen}00`, undefined, `dev-${phoneNumberSeed}@dave1.com`);
  await make(`${firstTen}01`, 15, `dev-${phoneNumberSeed}@dave2.com`);
}

export async function down(phoneNumberSeed: string = '123') {
  const phone = `+1${phoneNumberSeed}4560100`;
  const firstTen = phone.substr(0, 10);

  await deleteUser(`${firstTen}00`);
  await deleteUser(`${firstTen}01`);
}

async function make(phoneNumber: string, amount?: number, email?: string) {
  const unique = phoneNumber.replace(/[^\d]+/g, '');

  const synapsepayId = Faker.random.alphaNumeric(24).substring(17) + unique;
  const synapseNodeId = Faker.random.alphaNumeric(24).substring(17) + unique;

  const firstName = path.basename(__filename).split('.')[0];
  const lastName = `Existing advance of $${amount}`;
  const user = await createUser({
    firstName,
    lastName,
    phoneNumber,
    synapsepayId,
    email,
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
    synapseNodeId,
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

  await insertFirstAdvance(userId, bankAccount.id, paymentMethod.id, false, amount);
  await insertSixtyDaysHistory(user.id, bankAccount.id);
}
