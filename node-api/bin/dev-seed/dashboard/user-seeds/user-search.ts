import { User } from '../../../../src/models';
import { createUser } from '../../utils';
import { deleteDataForUser } from '../../delete-user';
import { getEmail } from '../utils';

const email = 'user.-+?&search@dave.com';

async function up(phoneNumberSeed: string) {
  await createUser({
    firstName: 'User Search',
    lastName: 'Seed',
    phoneNumber: `+1${phoneNumberSeed}5551234`,
    email: getEmail(phoneNumberSeed, email),
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
