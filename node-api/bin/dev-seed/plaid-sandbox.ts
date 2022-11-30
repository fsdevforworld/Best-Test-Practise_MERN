import { createUser } from './utils';
import factory from '../../test/factories';
import * as Faker from 'faker';

export async function up(phoneNumberSeed: string = '123') {
  const user = await createUser({
    firstName: 'Grumpy',
    lastName: 'Bear',
    email: `grumpy-bear-${phoneNumberSeed}-${Faker.random.alphaNumeric(8)}@dave.com`,
    settings: { doNotDisburse: true },
  });

  const institution = await factory.create('institution', {
    plaidInstitutionId: `ins_${Faker.random.number(999999)}`,
  });

  const bankConnection = await factory.create('bank-connection', {
    institutionId: institution.id,
    userId: user.id,
    externalId: `${Faker.random.alphaNumeric(37)}`,
    authToken: `access-sandbox-2a2173b4-a959-4f75-a836-${Faker.random.alphaNumeric(12)}`,
    hasValidCredentials: true,
    bankingDataSource: 'PLAID',
  });

  const sharedAccountProps = {
    bankConnectionId: bankConnection.id,
    userId: user.id,
    institutionId: institution.id,
  };

  const [defaultBankAccount] = await Promise.all([
    factory.create('bank-account', {
      ...sharedAccountProps,
      externalId: `${Faker.random.alphaNumeric(37)}`,
      subtype: 'CHECKING',
    }),
    factory.create('bank-account', {
      ...sharedAccountProps,
      externalId: `${Faker.random.alphaNumeric(37)}`,
      subtype: 'SAVINGS',
    }),
  ]);

  await user.update({
    defaultBankAccountId: defaultBankAccount.id,
  });

  return user;
}
