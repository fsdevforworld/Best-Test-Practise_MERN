import * as path from 'path';
import { moment } from '@dave-inc/time-lib';
import { EmailVerification } from '../../src/models';
import * as BankingDataSync from '../../src/domain/banking-data-sync';
import { BalanceLogCaller } from '../../src/typings';
import {
  createUser,
  insertFirstAdvance,
  insertNormalIncomeTransactions,
  insertOnboardingSteps,
  insertSixtyDaysHistory,
} from './utils';
import factory from '../../test/factories';
import { BankingDataSource, ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { deleteUser } from './delete-user';
import * as Faker from 'faker';

async function up(phoneNumberSeed: string = '900') {
  const phone = `+1${phoneNumberSeed}1111190`;
  const firstTen = phone.substr(0, 10);
  await Promise.all([
    make(`previous-advancep-paid-${phoneNumberSeed}@dave.com`, `${firstTen}90`, true, false),
    make(`previous-advance-unpaid1-${phoneNumberSeed}@dave.com`, `${firstTen}91`, false, false),
    make(`previous-advance-pending-${phoneNumberSeed}@dave.com`, `${firstTen}92`, false, true),
  ]);
}

async function down(phoneNumberSeed: string = '900') {
  const phone = `+1${phoneNumberSeed}1111190`;
  const firstTen = phone.substr(0, 10);

  await Promise.all([
    deleteUser(`${firstTen}90`),
    deleteUser(`${firstTen}91`),
    deleteUser(`${firstTen}92`),
  ]);
}

async function make(
  email: string,
  phoneNumber: string,
  isPaidOff: boolean,
  hasPending: boolean,
  missed = true,
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
    lastName: 'UI Tests for past advances',
    settings: { default_tip: 10, doNotDisburse: true, shouldUseMachineLearning: false },
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
  const paymentMethodId = paymentMethod.id;

  await bankAccount.update({ defaultPaymentMethodId: paymentMethod.id });

  await insertOnboardingSteps(userId);

  const { recurringTransactionId } = await insertNormalIncomeTransactions(
    userId,
    bankAccountId,
    {
      name: 'My Profitable Gambling Habit',
      amount: 500,
      missed: missed ? moment().format('YYYY-MM-DD H:m:s') : null,
    },
    true,
  );

  await bankAccount.update({ mainPaycheckRecurringTransactionId: recurringTransactionId });

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
    bankAccount,
    BalanceLogCaller.BinDevSeed,
    BankingDataSource.Plaid,
  );
  const advanceId = await insertFirstAdvance(
    userId,
    bankAccountId,
    paymentMethodId,
    isPaidOff,
    75,
    moment().subtract(10, 'days'),
    moment().subtract(4, 'days'),
  );

  if (hasPending) {
    await factory.create('payment', {
      userId,
      bankAccountId,
      advanceId,
      paymentMethodId: paymentMethod.id,
      amount: 83.75,
      status: ExternalTransactionStatus.Pending,
      created: moment().subtract(0, 'days'),
    });
  }
}

export { up, down };
