import * as Faker from 'faker';

import { AdvanceExperiment } from '../../src/models';

export default function(factory: any) {
  factory.define('advance-experiment', AdvanceExperiment, {
    name: Faker.random.word,
    version: Faker.random.number,
    startDate: () => Faker.date.past(1),
    endDate: () => Faker.date.future(1),
  });
}
