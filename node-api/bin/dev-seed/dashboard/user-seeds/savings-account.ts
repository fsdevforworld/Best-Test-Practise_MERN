import { User } from '../../../../src/models';
import factory from '../../../../test/factories';
import { deleteDataForUser } from '../../delete-user';
import { createUser } from '../../utils';
import { getEmail } from '../utils';
import { BankAccountSubType } from '@dave-inc/loomis-client';

const email = 'savings-account-user@dave.com';

async function up(phoneNumberSeed: string) {
  const user = await createUser({
    firstName: 'Savings Account User',
    lastName: 'Seed',
    email: getEmail(phoneNumberSeed, email),
  });

  const bankConnection = await factory.create('bank-connection', {
    userId: user.id,
    hasValidCredentials: true,
    hasTransactions: true,
  });

  await factory.create('savings-account', {
    userId: user.id,
    institutionId: bankConnection.institutionId,
    bankConnectionId: bankConnection.id,
    subtype: BankAccountSubType.Savings,
    displayName: 'savings account',
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
