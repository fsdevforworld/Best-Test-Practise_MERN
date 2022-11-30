import { Role } from '../../src/models';
import * as Faker from 'faker';

export default function(factory: any) {
  factory.define('role', Role, {
    name: Faker.random.word,
  });
}
