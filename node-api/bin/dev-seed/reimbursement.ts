import { ReimbursementStatus } from '../../src/typings';
import { InternalUser } from '../../src/models';
import { createUser } from './utils';
import factory from '../../test/factories';
import { deleteUser } from './delete-user';

async function up(phoneNumberSeed: string = '100') {
  const phone = `+1${phoneNumberSeed}4560700`;
  const firstTen = phone.substr(0, 10);
  await Promise.all([
    failedCardReimbursement(`${firstTen}40`, `${firstTen}41`),
    successfulReimbursement(`${firstTen}42`, `${firstTen}43`),
  ]);
}

async function down(phoneNumberSeed: string = '100') {
  const phone = `+1${phoneNumberSeed}4560700`;
  const firstTen = phone.substr(0, 10);

  await Promise.all([
    deleteUser(`${firstTen}40`),
    deleteUser(`${firstTen}41`),
    deleteUser(`${firstTen}42`),
    deleteUser(`${firstTen}43`),
  ]);
}

async function setupReimbursement(
  initiatorPhone: string,
  reimburserPhone: string,
  status: ReimbursementStatus,
) {
  const { id: userId } = await createUser({
    email: `reimbursement-${initiatorPhone}@dave.com`,
    phoneNumber: initiatorPhone,
    firstName: 'reimbursement',
    lastName: status,
    skipSubscriptionBilling: true,
    settings: { doNotDisburse: true },
  });
  const [{ id: reimburserId }] = await InternalUser.findCreateFind({
    where: {
      email: `dev-${reimburserPhone}@dave.com`,
    },
  });
  const billing = await factory.create('subscription-billing', {
    userId,
  });
  const payment = await factory.create('subscription-payment', {
    userId: billing.userId,
  });

  await billing.addSubscriptionPayment(payment);

  return {
    subscriptionPaymentId: payment.id,
    userId,
    reimburserId,
  };
}

async function failedCardReimbursement(initiatorPhone: string, reimburserPhone: string) {
  const reimbursementSetupInfo = await setupReimbursement(
    initiatorPhone,
    reimburserPhone,
    ReimbursementStatus.Failed,
  );

  await factory.create('card-failed-reimbursement', {
    amount: 1.0,
    ...reimbursementSetupInfo,
  });
}

async function successfulReimbursement(initiatorPhone: string, reimburserPhone: string) {
  const reimbursementSetupInfo = await setupReimbursement(
    initiatorPhone,
    reimburserPhone,
    ReimbursementStatus.Completed,
  );

  await factory.create('reimbursement', {
    status: ReimbursementStatus.Completed,
    amount: 1.0,
    ...reimbursementSetupInfo,
  });
}

export { up, down };
