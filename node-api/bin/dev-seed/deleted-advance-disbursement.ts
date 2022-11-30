import { createUser } from './utils';
import factory from '../../test/factories';
import * as Faker from 'faker';

export async function up(phoneNumberSeed: string = '123') {
  const allStatuses = ['PENDING', 'UNKNOWN', 'COMPLETED', 'RETURNED', 'CANCELED', 'NOTDISBURSED'];
  await Promise.all(allStatuses.map((status, index) => make(status, index, phoneNumberSeed)));
}

async function make(disbursementStatus: string, index: number, phoneNumberSeed: string) {
  const user = await createUser({
    email: `deleted-disbursement${index}-${phoneNumberSeed}-${Faker.random.alphaNumeric(
      8,
    )}@dave.com`,
    firstName: 'deleted disbursement',
    lastName: disbursementStatus,
    settings: { doNotDisburse: true },
  });
  const userId = user.id;
  const advance = await factory.create('advance', {
    userId,
    disbursementStatus,
  });
  await advance.destroy();
}
