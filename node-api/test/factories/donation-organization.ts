import * as Faker from 'faker';
import DonationOrganization from '../../src/models/donation-organization';

export default function(factory: any) {
  factory.define('donation-organization', DonationOrganization, {
    name: () => Faker.random.words(3),
    code: () => Faker.random.word(),
  });
}
