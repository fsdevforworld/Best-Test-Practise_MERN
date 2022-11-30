import { HustleSortOrder } from '@dave-inc/wire-typings';
import * as Faker from 'faker';
import { HustleJobPack } from '../../src/models';
import { SequelizeAdapterOrObjectAdapter } from './sequelize-or-object-adapter';

export default function(factory: any) {
  factory.setAdapter(new SequelizeAdapterOrObjectAdapter(), 'hustle-job-pack');
  factory.define('hustle-job-pack', HustleJobPack, {
    name: () => Faker.random.word(),
    sortBy: () => Faker.random.word(),
    sortOrder: HustleSortOrder.ASC,
    image: () => Faker.image.imageUrl(10),
    bgColor: () => Faker.random.alphaNumeric(6),
  });
}
