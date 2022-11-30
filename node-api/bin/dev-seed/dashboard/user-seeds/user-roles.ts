import { Role, User } from '../../../../src/models';
import factory from '../../../../test/factories';
import { createUser } from '../../utils';
import { getEmail } from '../utils';
import { UserRole as UserRoleName } from '@dave-inc/wire-typings';
import { deleteDataForUser } from '../../delete-user';

const email = 'user-roles@dave.com';

async function up(phoneNumberSeed: string) {
  const [{ id: userId }] = await Promise.all([
    createUser({
      firstName: 'User Roles',
      lastName: 'Seed',
      email: getEmail(phoneNumberSeed, email),
    }),
  ]);

  const testerRole = await Role.findOne({ where: { name: UserRoleName.tester } });

  await Promise.all([factory.create('user-role', { userId, roleId: testerRole.id })]);
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
