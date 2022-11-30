import { User } from '../../../../src/models';
import factory from '../../../../test/factories';
import { deleteDataForUser } from '../../delete-user';
import { createUser } from '../../utils';
import { getEmail } from '../utils';
import {
  AdvanceDelivery,
  ExternalTransactionProcessor,
  ExternalTransactionStatus,
} from '@dave-inc/wire-typings';
import * as Faker from 'faker';

const email = 'refresh-payments@dave.com';

async function up(phoneNumberSeed: string) {
  const user = await createUser({
    firstName: 'Refresh Payment',
    lastName: 'Dashboard Seed',
    email: getEmail(phoneNumberSeed, email),
  });

  const bankAccount = await factory.create('checking-account', { userId: user.id });
  const paymentMethod = await factory.create('payment-method', {
    bankAccountId: bankAccount.id,
    userId: bankAccount.userId,
    tabapayId: Faker.random.alphaNumeric(24),
    risepayId: null,
  });

  const advance = await factory.create('advance', {
    delivery: AdvanceDelivery.Express,
    paymentMethodId: paymentMethod.id,
    bankAccountId: bankAccount.id,
    userId: paymentMethod.userId,
    amount: 50,
  });

  await factory.create('payment', {
    advanceId: advance.id,
    userId: bankAccount.userId,
    paymentMethodId: paymentMethod.id,
    amount: 75,
    status: ExternalTransactionStatus.Pending,
    externalId: Faker.random.alphaNumeric(24),
    referenceId: '200',
    externalProcessor: ExternalTransactionProcessor.Tabapay,
  });

  await factory.create('advance-tip', { advanceId: advance.id, amount: 0, percent: 0 });
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
