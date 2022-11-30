import { SideHustleProvider } from '../../src/models';
import * as Faker from 'faker';

export default function(factory: any) {
  factory.define('side-hustle-provider', SideHustleProvider, {
    name: () => Faker.company.companyName(),
    isDaveAuthority: true,
  });
}
