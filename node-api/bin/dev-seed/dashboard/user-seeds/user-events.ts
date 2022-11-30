import { AuditLog, User } from '../../../../src/models';
import { createUser } from '../../utils';
import { deleteDataForUser } from '../../delete-user';
import { getEmail } from '../utils';
import * as Faker from 'faker';
import { moment } from '@dave-inc/time-lib';
import { orderBy } from 'lodash';

const email = 'user-events@dave.com';

async function up(phoneNumberSeed: string) {
  const user = await createUser({
    firstName: 'User Events',
    lastName: 'Seed',
    email: getEmail(phoneNumberSeed, email),
  });

  const arr = new Array(50).fill(0);

  const dates = arr.map(_ => {
    return moment(Faker.date.recent(10));
  });

  // Always need data between these dates for recording tests
  dates.push(moment(Faker.date.between('2021-06-01', '2021-06-07')));
  dates.push(moment(Faker.date.between('2021-06-01', '2021-06-07')));
  dates.push(moment(Faker.date.between('2021-06-01', '2021-06-07')));
  dates.push(moment(Faker.date.between('2021-06-01', '2021-06-07')));

  const sortedDates = orderBy(dates, moment, 'desc');

  const logs = sortedDates.map(date => ({
    userId: user.id,
    type: Faker.hacker.ingverb(),
    message: Faker.hacker.phrase(),
    created: date,
  }));

  await AuditLog.bulkCreate(logs);
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
