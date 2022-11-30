import { User } from '../../../../src/models';
import factory from '../../../../test/factories';
import { deleteDataForUser } from '../../delete-user';
import { createUser } from '../../utils';
import { getEmail } from '../utils';

const email = 'multiple-transactions@dave.com';

async function up(phoneNumberSeed: string) {
  const user = await createUser({
    firstName: 'Multiple Transactions',
    lastName: 'Dashboard Seed',
    email: getEmail(phoneNumberSeed, email),
  });

  const userId = user.id;

  const bankConnection = await factory.create('bank-connection', {
    userId,
    hasValidCredentials: true,
    hasTransactions: true,
  });

  const bankAccount = await factory.create('checking-account', {
    userId,
    displayName: 'Multiple Transaction Account',
    lastFour: '1234',
    institutionId: bankConnection.institutionId,
    bankConnectionId: bankConnection.id,
    current: 500,
    available: 450,
  });

  const bankAccountId = bankAccount.id;
  await user.update({ defaultBankAccountId: bankAccountId });

  await Promise.all([
    factory.create('bank-transaction', {
      userId,
      bankAccountId,
      amount: 100,
    }),
    factory.create('bank-transaction', {
      userId,
      bankAccountId,
      amount: 101,
      displayName: 'Member Intelligence Transaction',
    }),
    factory.create('bank-transaction', {
      userId,
      bankAccountId,
      amount: -75,
    }),
    factory.create('bank-transaction', {
      userId,
      bankAccountId,
      displayName: 'Multiple filter 50',
    }),
    factory.create('bank-transaction', {
      userId,
      bankAccountId,
      amount: 50,
    }),
  ]);
}

async function down(phoneNumberSeed: string) {
  const user = await User.findOne({
    where: {
      email: getEmail(phoneNumberSeed, email),
    },
  });

  if (user) {
    await deleteDataForUser(user);
  }
}

export { up, down };
