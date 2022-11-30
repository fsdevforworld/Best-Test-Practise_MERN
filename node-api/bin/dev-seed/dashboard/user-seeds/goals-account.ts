import { createUser } from '../../utils';
import { User } from '../../../../src/models';
import { deleteDataForUser } from '../../delete-user';
import { runSeedAsScript } from '../utils';
import { generateClient } from '../../../../src/services/internal-dashboard-api/domain/goals';
import * as Faker from 'faker';
import logger from '../../../../src/lib/logger';

async function up() {
  const user = await createUser({
    email: Faker.internet.email(),
    firstName: 'Goals',
    lastName: 'Seed',
    birthdate: '1990-01-01',
    ssn: `${Faker.random.number(6)}${Faker.phone.phoneNumber('########')}`,
  });

  await user.reload();

  const goalsClient = generateClient(user.id);

  // This will fail locally but might suceed in staging
  try {
    await goalsClient.createGoalAccount({
      dateOfBirth: '1990-01-01',
      ssn: user.ssn,
      firstName: user.firstName,
      lastName: user.lastName,
    });
  } catch (err) {
    logger.warn(err);
  }
}

async function down() {
  const users = await User.findAll({
    where: {
      firstName: 'Goals',
      lastName: 'Seed',
    },
  });

  await Promise.all(users.map(user => deleteDataForUser(user)));
}

export { up, down };

if (require.main === module) {
  runSeedAsScript(up, down);
}
