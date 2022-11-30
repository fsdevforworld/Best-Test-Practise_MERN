import { createUser } from '../../utils';
import factory from '../../../../test/factories';
import { moment } from '@dave-inc/time-lib';
import { deleteDataForUser } from '../../delete-user';
import { User } from '../../../../src/models';
import * as Bluebird from 'bluebird';
import { getEmail } from '../utils';

const deletedEmail = 'dashboard-deleted-user@dave.com';
const deletedOverrideEmail = 'dashboard-deleted-user-override@dave.com';

async function up(phoneNumberSeed: string) {
  await Promise.all([
    make(getEmail(phoneNumberSeed, deletedEmail), 'Deleted User', false, 'Fraud'),
    make(
      getEmail(phoneNumberSeed, deletedOverrideEmail),
      'Deleted User Override',
      true,
      'Duplicate',
    ),
  ]);
}

async function down(phoneNumberSeed: string) {
  const users = await User.findAll({
    where: {
      email: [
        getEmail(phoneNumberSeed, deletedEmail),
        getEmail(phoneNumberSeed, deletedOverrideEmail),
      ],
    },
    paranoid: false,
  });

  await Bluebird.map(users, deleteDataForUser);
}

async function make(
  email: string,
  lastName: string,
  overrideSixtyDayDelete: boolean,
  reason: string,
) {
  const user = await createUser({
    firstName: 'Dashboard',
    lastName,
    email,
    overrideSixtyDayDelete,
    deleted: moment(),
  });

  await factory.create('delete-request', { userId: user.id, reason });
}

export { up, down };
