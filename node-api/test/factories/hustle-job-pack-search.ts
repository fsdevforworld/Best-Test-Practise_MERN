import * as Faker from 'faker';
import { HustleJobPackSearch } from '../../src/models';
import { SequelizeAdapterOrObjectAdapter } from './sequelize-or-object-adapter';

export default function(factory: any) {
  factory.setAdapter(new SequelizeAdapterOrObjectAdapter(), 'hustle-job-pack-search');
  factory.define('hustle-job-pack-search', HustleJobPackSearch, {
    hustleJobPackId: factory.assoc('hustle-job-pack', 'id'),
    term: () => Faker.random.word(),
    value: () => Faker.random.word(),
  });
}
