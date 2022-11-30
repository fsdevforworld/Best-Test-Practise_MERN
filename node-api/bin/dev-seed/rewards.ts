import { createUser, insertOnboardingSteps } from './utils';
import factory from '../../test/factories';
import * as moment from 'moment';
import { deleteUser } from './delete-user';
import * as Faker from 'faker';

// Create several users to test Dave rewards scenarios
async function up(phoneNumberSeed: string = '111') {
  await Promise.all([
    // User who is opted into Dave Rewards but has not linked their card
    createDaveRewardsUser({
      email: `dave-rewards-user-1-${phoneNumberSeed}@dave.com`,
      phoneNumber: `+1${phoneNumberSeed}2223333`,
      firstName: 'Dave',
      lastName: 'Rewards with no linked card',
      paymentMethodProperties: {
        optedIntoDaveRewards: 1,
        empyrCardId: null,
        mask: 1234,
        scheme: 'visa',
        expiration: moment()
          .add(10, 'months')
          .format('YYYY-MM-DD'),
      },
      empyrUserId: 12345,
    }),
    // User who is opted into Dave Rewards and has linked their card
    createDaveRewardsUser({
      email: `dave-rewards-user-2-${phoneNumberSeed}@dave.com`,
      phoneNumber: `+1${phoneNumberSeed}2223344`,
      firstName: 'Dave',
      lastName: 'Rewards User with linked card',
      paymentMethodProperties: {
        optedIntoDaveRewards: 1,
        empyrCardId: 111222333,
        mask: 5678,
        scheme: 'mastercard',
        expiration: moment()
          .add(15, 'months')
          .format('YYYY-MM-DD'),
      },
      empyrUserId: 56789,
    }),
    // User who is not opted into Dave Rewards and has not linked their card
    createDaveRewardsUser({
      email: `dave-rewards-user-3-${phoneNumberSeed}@dave.com`,
      phoneNumber: `+1${phoneNumberSeed}2223355`,
      firstName: 'Dave',
      lastName: 'Rewards User with no linked card and not opted in',
      paymentMethodProperties: {
        optedIntoDaveRewards: 0,
        empyrCardId: null,
        mask: 1122,
        scheme: 'other',
        expiration: moment()
          .add(3, 'months')
          .format('YYYY-MM-DD'),
      },
      empyrUserId: null,
    }),
  ]);
}

async function down(phoneNumberSeed: string = '111') {
  await Promise.all([
    deleteUser(`+1${phoneNumberSeed}2223333`),
    deleteUser(`+1${phoneNumberSeed}2223344`),
    deleteUser(`+1${phoneNumberSeed}2223355`),
  ]);
}

async function createDaveRewardsUser({
  email,
  phoneNumber,
  firstName,
  lastName,
  paymentMethodProperties = {},
  empyrUserId,
}: {
  email: string;
  phoneNumber: string;
  firstName: string;
  lastName: string;
  paymentMethodProperties?: object;
  empyrUserId: number;
}) {
  const synapsepayId = Faker.random.alphaNumeric(20);
  const synapseNodeId = Faker.random.alphaNumeric(24);

  const user = await createUser({
    email,
    phoneNumber,
    synapsepayId,
    firstName,
    lastName,
    empyrUserId,
    emailVerified: true,
    settings: { doNotDisburse: true },
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
    current: 1400,
    available: 1400,
    synapseNodeId,
  });

  await insertOnboardingSteps(userId);
  const bankAccountId = bankAccount.id;

  const paymentMethod = await factory.create('payment-method', {
    bankAccountId,
    userId,
    ...paymentMethodProperties,
  });

  bankAccount.defaultPaymentMethodId = paymentMethod.id;
  await bankAccount.save();
}

export { up, down };
