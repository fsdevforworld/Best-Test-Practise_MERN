import { createUser } from './utils';
import * as faker from 'faker';
import { deleteUser } from './delete-user';

async function up(phoneNumberSeed: string = '900') {
  await createUser({
    email: faker.internet.email,
    phoneNumber: `+1${phoneNumberSeed}3333333`,
    firstName: faker.name.firstName,
    lastName: faker.name.lastName,
    settings: {
      low_balance_alert: 30,
      sms_notifications_enabled: true,
      push_notifications_enabled: false,
      doNotDisburse: true,
    },
    emailVerified: true,
  });

  await createUser({
    email: faker.internet.email,
    phoneNumber: `+1${phoneNumberSeed}3333334`,
    firstName: faker.name.firstName,
    lastName: faker.name.lastName,
    settings: {
      low_balance_alert: 30,
      sms_notifications_enabled: false,
      push_notifications_enabled: true,
      doNotDisburse: true,
    },
    emailVerified: true,
  });

  await createUser({
    email: faker.internet.email,
    phoneNumber: `+1${phoneNumberSeed}3333335`,
    firstName: faker.name.firstName,
    lastName: faker.name.lastName,
    settings: {
      low_balance_alert: 30,
      sms_notifications_enabled: true,
      push_notifications_enabled: true,
      doNotDisburse: true,
    },
    emailVerified: true,
  });

  await createUser({
    email: faker.internet.email,
    phoneNumber: `+1${phoneNumberSeed}3333336`,
    firstName: faker.name.firstName,
    lastName: faker.name.lastName,
    settings: {
      low_balance_alert: 30,
      doNotDisburse: true,
    },
    emailVerified: true,
  });

  await createUser({
    email: faker.internet.email,
    phoneNumber: `+1${phoneNumberSeed}3333337`,
    firstName: faker.name.firstName,
    lastName: faker.name.lastName,
    settings: {
      low_balance_alert: 30,
      sms_notifications_enabled: false,
      push_notifications_enabled: false,
      doNotDisburse: true,
    },
    emailVerified: true,
  });

  await createUser({
    email: faker.internet.email,
    phoneNumber: `+1${phoneNumberSeed}3333338`,
    firstName: faker.name.firstName,
    lastName: faker.name.lastName,
    settings: {
      sms_notifications_enabled: false,
      push_notifications_enabled: false,
      doNotDisburse: true,
    },
    emailVerified: true,
  });
}

async function down(phoneNumberSeed: string = '900') {
  await deleteUser(`+1${phoneNumberSeed}3333333`);
  await deleteUser(`+1${phoneNumberSeed}3333334`);
  await deleteUser(`+1${phoneNumberSeed}3333335`);
  await deleteUser(`+1${phoneNumberSeed}3333336`);
  await deleteUser(`+1${phoneNumberSeed}3333337`);
  await deleteUser(`+1${phoneNumberSeed}3333338`);
}

export { up, down };
