import { BankingDataSource } from '@dave-inc/wire-typings';
import { BankAccount, BankConnection, User } from '../../../../src/models';
import { syncUserDefaultBankAccount } from '../../../../src/domain/banking-data-sync';
import factory from '../../../../test/factories';
import { createUser } from '../../utils';
import { deleteDataForUser } from '../../delete-user';
import { getEmail } from '../utils';
import { moment } from '@dave-inc/time-lib';

const email = 'debit-cards@seed.com';

async function up(phoneNumberSeed: string) {
  const user = await createUser({
    firstName: 'Debit Cards',
    lastName: 'Seed',
    email: getEmail(phoneNumberSeed, email),
  });

  const bankConnection = await factory.create<BankConnection>('bank-connection', {
    userId: user.id,
    bankingDataSource: BankingDataSource.Plaid,
  });

  const bankAccount = await factory.create<BankAccount>('bank-account', {
    userId: user.id,
    bankConnectionId: bankConnection.id,
  });

  await user.update({ defaultBankAccountId: bankAccount.id });

  await syncUserDefaultBankAccount(bankAccount.id);

  const paymentMethod = await factory.create('payment-method', {
    bankAccountId: bankAccount.id,
    userId: user.id,
    expiration: moment('2022-06-01'),
  });

  await bankAccount.update({ defaultPaymentMethodId: paymentMethod.id });

  await factory.create('payment-method', {
    bankAccountId: bankAccount.id,
    userId: user.id,
    deleted: moment(),
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
