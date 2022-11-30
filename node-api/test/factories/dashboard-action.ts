import * as Faker from 'faker';
import { kebabCase } from 'lodash';
import { DashboardAction } from '../../src/models';

export default function(factory: any) {
  factory.define('dashboard-action', DashboardAction, {
    name: Faker.hacker.phrase,
    code: () => kebabCase(Faker.hacker.phrase()),
  });
}
