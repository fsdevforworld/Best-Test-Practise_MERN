import { moment } from '@dave-inc/time-lib';
import { createUser, insertFirstAdvance } from './utils';
import factory from '../../test/factories';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { deleteUser } from './delete-user';
import * as Faker from 'faker';

// Create data to simulate double charge
async function up(phoneNumberSeed: string = '222') {
  const phone = `+1${phoneNumberSeed}2222200`;
  const firstTen = phone.substr(0, 10);

  await Promise.all([
    // User with a risepay payment
    createDoubleCharge({
      email: `double-charge-dude-${phoneNumberSeed}@dave.com`,
      phoneNumber: `${firstTen}11`,
      firstName: 'DoubleChargeDude',
      lastName: 'RisepayPayment',
      paymentMethodProperties: {
        risepayId: `${Faker.random.alphaNumeric(7)}-08c5-43f3-bba6-900fe2b43c81`,
      },
      paymentsProperties: [
        {
          externalId: Faker.random.alphaNumeric(24),
          referenceId: '200',
          status: ExternalTransactionStatus.Canceled,
        },
        {
          externalId: Faker.random.alphaNumeric(24),
          referenceId: '201',
          status: ExternalTransactionStatus.Completed,
        },
      ],
      advanceAmount: 0.15,
      advanceFee: 0,
      advanceTip: 0,
      advanceTipPercent: 0,
      paymentAmount: 0.15,
    }),

    // User with a tabapay payment
    createDoubleCharge({
      email: `double-charge-guy-${phoneNumberSeed}@dave.com`,
      phoneNumber: `${firstTen}12`,
      firstName: 'DoubleChargeGuy',
      lastName: 'TabapayPayment',
      paymentMethodProperties: {
        tabapayId: Faker.random.alphaNumeric(22),
      },
      paymentsProperties: [
        {
          externalId: Faker.random.alphaNumeric(22),
          referenceId: 'test-ref-200',
          status: ExternalTransactionStatus.Canceled,
        },
        {
          externalId: Faker.random.alphaNumeric(22),
          referenceId: 'test-ref-201',
          status: ExternalTransactionStatus.Completed,
        },
      ],
      advanceAmount: 0.15,
      advanceFee: 0,
      advanceTip: 0,
      advanceTipPercent: 0,
      paymentAmount: 0.15,
    }),
  ]);
}

async function down(phoneNumberSeed: string = '222') {
  const phone = `+1${phoneNumberSeed}2222200`;
  const firstTen = phone.substr(0, 10);

  await Promise.all([deleteUser(`${firstTen}11`), deleteUser(`${firstTen}12`)]);
}

// Create a user who has a double charge
async function createDoubleCharge({
  email,
  phoneNumber,
  firstName,
  lastName,
  isAdvancePaidOff = true,
  paymentMethodProperties = {},
  paymentsProperties,
  advanceAmount,
  advanceFee,
  advanceTip,
  advanceTipPercent,
  paymentAmount,
}: {
  email: string;
  phoneNumber: string;
  firstName: string;
  lastName: string;
  isAdvancePaidOff?: boolean;
  paymentMethodProperties?: object;
  paymentsProperties: any[];
  advanceAmount: number;
  advanceFee: number;
  advanceTip: number;
  advanceTipPercent: number;
  paymentAmount: number;
}) {
  const { userId, bankAccountId }: { userId: number; bankAccountId: number } = await setupUser({
    email,
    phoneNumber,
    firstName,
    lastName,
  });

  const paymentMethod = await factory.create('payment-method', {
    bankAccountId,
    userId,
    ...paymentMethodProperties,
  });
  const paymentMethodId = paymentMethod.id;

  const advanceId = await insertFirstAdvance(
    userId,
    bankAccountId,
    paymentMethodId,
    isAdvancePaidOff,
    advanceAmount,
    moment().subtract(10, 'days'),
    moment().subtract(4, 'days'),
    advanceFee,
    advanceTip,
    advanceTipPercent,
  );

  paymentsProperties.forEach(async (paymentProperties: any) => {
    await factory.create('payment', {
      userId,
      bankAccountId,
      advanceId,
      paymentMethodId,
      amount: paymentAmount,
      created: moment().subtract(0, 'days'),
      ...paymentProperties,
    });
  });
}

async function setupUser({
  email,
  phoneNumber,
  firstName,
  lastName,
}: {
  email: string;
  phoneNumber: string;
  firstName: string;
  lastName: string;
}) {
  const synapsepayId = Faker.random.alphaNumeric(20);
  const synapseNodeId = Faker.random.alphaNumeric(22);

  const user = await createUser({
    email,
    phoneNumber,
    synapsepayId,
    firstName,
    lastName,
    settings: { default_tip: 10, doNotDisburse: true },
    emailVerified: true,
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
  const bankAccountId = bankAccount.id;

  return {
    userId,
    bankAccountId,
  };
}

export { up, down };
