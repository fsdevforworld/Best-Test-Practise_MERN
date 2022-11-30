import * as Faker from 'faker';
import { Institution } from '../../src/models';

export default function(factory: any) {
  factory.define('institution', Institution, {
    displayName: () => Faker.company.companyName(),
    plaidInstitutionId: () => Faker.random.alphaNumeric(12),
    primaryColor: () => Faker.internet.color(),
    usernameLabel: 'username',
    passwordLabel: 'password',
  });
}
