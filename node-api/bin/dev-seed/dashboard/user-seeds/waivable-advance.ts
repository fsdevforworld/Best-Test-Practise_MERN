import { User } from '../../../../src/models';
import factory from '../../../../test/factories';
import { createUser } from '../../utils';
import { getEmail } from '../utils';
import { deleteDataForUser } from '../../delete-user';

const email = 'waivable-advance@dave.com';

async function up(phoneNumberSeed: string) {
  const user = await createUser({
    firstName: 'Waivable Advance',
    lastName: 'Seed',
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
    institutionId: bankConnection.institutionId,
    bankConnectionId: bankConnection.id,
  });

  const advance = await factory.create('advance', {
    amount: 100,
    fee: 4.99,
    outstanding: 104.99,
    disbursementStatus: 'COMPLETED',
    delivery: 'EXPRESS',
    bankAccountId: bankAccount.id,
    userId,
  });

  await factory.create('advance-tip', {
    advanceId: advance.id,
    amount: 0,
    percent: 0,
  });
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
