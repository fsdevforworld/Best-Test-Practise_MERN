import { DonationOrganizationCode } from '@dave-inc/wire-typings';
import { createUser, insertOnboardingSteps } from './utils';
import factory from '../../test/factories';
import { moment } from '@dave-inc/time-lib';
import { deleteUser } from './delete-user';

export async function up(phoneNumberSeed: string = '900') {
  const user = await createUser({
    firstName: 'Advance disbursement not received',
    lastName: 'UI Test for Network Screen',
    phoneNumber: `+1${phoneNumberSeed}5551133`,
    email: `disbursement-not-recieved-${phoneNumberSeed}@dave.com`,
    settings: { doNotDisburse: true },
  });
  const amount = 75;
  const processor = 'TABAPAY';
  const approvalCode = '07864';
  const networkId = '2786GFD6871FD68';
  const network = 'VisaFF';

  const bankConnection = await factory.create('bank-connection', {
    userId: user.id,
    hasValidCredentials: true,
    hasTransactions: true,
  });
  const bankAccount = await factory.create('checking-account', {
    userId: user.id,
    institutionId: bankConnection.institutionId,
    bankConnectionId: bankConnection.id,
    current: 500,
    available: 500,
  });
  await user.update({ defaultBankAccountId: bankAccount.id });
  await insertOnboardingSteps(user.id);

  const paymentMethod = await factory.create('payment-method', {
    availability: 'immediate',
    bankAccountId: bankAccount.id,
    displayName: 'Visa: 8298',
    expiration: moment()
      .add(1, 'year')
      .format('YYYY-MM-DD'),
    linked: 0,
    mask: '8298',
    scheme: 'visa',
    userId: user.id,
  });
  await bankAccount.update({ defaultPaymentMethodId: paymentMethod.id });
  const created = moment().subtract(9, 'hours');
  const advance = await factory.create('advance', {
    amount,
    approvalCode,
    bankAccountId: bankAccount.id,
    created,
    delivery: 'EXPRESS',
    disbursementStatus: 'COMPLETED',
    paybackDate: moment()
      .add('3', 'days')
      .format('YYYY-MM-DD'),
    disbursementProcessor: processor,
    network,
    networkId,
    outstanding: amount,
    paymentMethodId: paymentMethod.id,
    updated: created,
    userId: user.id,
  });
  await factory.create('advance-tip', {
    advanceId: advance.id,
    donationOrganization: DonationOrganizationCode.TREES,
    amount: 1.0,
  });
}

export async function down(phoneNumberSeed: string = '900') {
  await deleteUser(`+1${phoneNumberSeed}5551133`);
}
